/**
 * LiveDeedService: the one backend. Reads come from the Deed program's accounts and events, Pump's accounts and the token
 * programs (see `chain/read.ts`); writes are real transactions built from the program's IDL (see `chain/writes.ts`,
 * `chain/launch.ts`) and signed by the connected wallet. Nothing is simulated, cached beyond a few seconds, or invented.
 */
import { config } from "@/lib/config";
import { DURATIONS, type DurationKey } from "@/lib/auction";
import { getClusterTime, getConnection, getSolBalance, getTokenHoldings, isValidPublicKey } from "@/lib/solana";
import { DeedRuleError } from "@/lib/errors";
import { ChainReader } from "@/chain/read";
import { resetEventCache } from "@/chain/events";
import { PROGRAM_ID } from "@/chain/program";
import { launch, type LaunchDeps } from "@/chain/launch";
import * as w from "@/chain/writes";
import type { CloseReason, CreateAuctionInput, CreateOfferInput, DeedService, FillOfferInput, LaunchInput, LaunchResult, PlaceBidInput, TxContext, TxReceipt } from "./types";
import type { PlatformStatus, WalletTokens } from "@/types";

const durationSecs = (k: DurationKey) => DURATIONS.find((d) => d.key === k)!.secs;

export class LiveDeedService implements DeedService {
  private reader = new ChainReader(getConnection(), () => getClusterTime());

  /** `launchDeps` lets a test replace the IPFS upload (the only off-chain step); everything else is always real. */
  constructor(private opts: { launchDeps?: LaunchDeps } = {}) {}

  /** Drops every cache so the next read sees the chain as it is now (used after writes and by tests). */
  invalidate() {
    resetEventCache();
    this.reader.invalidate();
  }

  /** After any write the next read must see it. */
  private async after<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } finally {
      this.invalidate();
    }
  }

  async getStatus(): Promise<PlatformStatus> {
    const coins = await this.reader.coins().catch(() => []);
    return {
      cluster: config.cluster,
      programId: PROGRAM_ID.toBase58(),
      feeBps: 100,
      otcFeeBps: 50,
      totalFeesLifetime: coins.reduce((a, c) => a + c.fees.lifetime, 0n),
    };
  }
  getClusterTime = () => getClusterTime();

  async getWalletTokens(wallet: string): Promise<WalletTokens> {
    if (!isValidPublicKey(wallet)) throw new Error("That is not a valid Solana wallet address.");
    const [sol, { tokens, truncated }] = await Promise.all([getSolBalance(wallet).catch(() => null), getTokenHoldings(wallet)]);
    return { wallet, sol, tokens, truncated };
  }

  listAuctions = () => this.reader.auctions();
  getAuction = (address: string) => this.reader.auctionDetail(address);
  listCoins = () => this.reader.coins();
  listActivity = () => this.reader.activity();
  getPortfolio = (wallet: string) => this.reader.portfolio(wallet);

  async launchCoin(ctx: TxContext, input: LaunchInput): Promise<LaunchResult> {
    const out = await this.after(launch(ctx, input, this.opts.launchDeps));
    const coin = (await this.reader.coins()).find((c) => c.mint === out.coinMint);
    if (!coin) throw new Error("The coin was launched but could not be read back yet. Refresh in a few seconds.");
    return { signature: out.signatures[out.signatures.length - 1] ?? "", message: `${coin.symbol} launched. Its Deed is in your wallet.`, coin };
  }

  async createAuction(ctx: TxContext, input: CreateAuctionInput): Promise<TxReceipt & { auction: string }> {
    const r = await this.after(w.createAuction(ctx, input.coinMint, input.startPrice, durationSecs(input.duration)));
    return { signature: r.signature, auction: r.auction, message: "Deed listed. It is now held in escrow by the auction." };
  }

  async placeBid(ctx: TxContext, input: PlaceBidInput): Promise<TxReceipt & { extended: boolean }> {
    const before = await w.getAuctionAcc(ctx, input.auction);
    const signature = await this.after(w.placeBid(ctx, input.auction, input.amount));
    const after = await w.getAuctionAcc(ctx, input.auction).catch(() => null);
    const extended = !!after && after.endTime > before.endTime;
    return { signature, extended, message: extended ? "Bid placed. The auction was extended by 5 minutes." : "Bid placed. If you are outbid, your SOL is returned automatically." };
  }

  async cancelAuction(ctx: TxContext, auction: string): Promise<TxReceipt> {
    return { signature: await this.after(w.cancelAuction(ctx, auction)), message: "Auction cancelled. The Deed is back in your wallet." };
  }

  async settleAuction(ctx: TxContext, auction: string): Promise<TxReceipt> {
    return { signature: await this.after(w.settleAuction(ctx, auction)), message: "Auction settled. The Deed went to the winner and the proceeds to the seller." };
  }

  async claimFees(ctx: TxContext, coinMint: string): Promise<TxReceipt> {
    return { signature: await this.after(w.claimFees(ctx, coinMint)), message: "Creator fees claimed to your wallet." };
  }

  getOtcStats = () => this.reader.otcStats();
  listOtcMarkets = () => this.reader.otcMarkets();
  getOtcToken = (mint: string) => this.reader.otcToken_(mint);
  getOtcOffer = (address: string) => this.reader.offerDetail(address);
  getOtcMine = (wallet: string) => this.reader.otcMine(wallet);
  getNotifications = (wallet: string) => this.reader.notifications(wallet);

  async createOffer(ctx: TxContext, input: CreateOfferInput): Promise<TxReceipt & { offer: string }> {
    const minFill = input.partial ? (input.minFill && input.minFill > 0n ? input.minFill : 1n) : input.amount;
    if (minFill > input.amount) throw new DeedRuleError("MIN_FILL", "The minimum fill cannot be larger than the offer.");
    const r = await this.after(
      w.createOffer(ctx, { kind: input.kind, mint: input.mint, amount: input.amount, priceTotal: input.priceTotal, minFill, expiresInSecs: input.expiresInSecs, counterparty: input.counterparty, parent: input.parent }),
    );
    return {
      signature: r.signature,
      offer: r.offer,
      message: input.kind === "SELL" ? "Offer created. Your tokens are held in escrow until it is filled or cancelled." : "Bid created. Your SOL is held in escrow until it is filled or cancelled.",
    };
  }

  async fillOffer(ctx: TxContext, input: FillOfferInput): Promise<TxReceipt> {
    return { signature: await this.after(w.fillOffer(ctx, input.offer, input.amount)), message: "Trade completed." };
  }

  async closeOffer(ctx: TxContext, offer: string, reason: CloseReason): Promise<TxReceipt> {
    const signature = await this.after(w.closeOffer(ctx, offer));
    return { signature, message: reason === "reject" ? "Offer rejected. The escrow went back to the maker." : "Offer closed. Your escrow was returned to you." };
  }
}
