/**
 * Real transactions for every write the app performs. Each function builds the instructions from the IDL, hands them to
 * the connected wallet through `ctx.send` (which signs, sends and waits for confirmation) and returns the signature.
 * Rules are enforced by the program; the checks here only turn a doomed transaction into a readable message sooner.
 */
import { ComputeBudgetProgram, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { config } from "@/lib/config";
import { DeedRuleError } from "@/lib/errors";
import type { TxContext } from "@/services/types";
import { decodeAuction, decodeConfig, decodeDeedState, decodeOffer, type AuctionAcc, type DeedStateAcc, type OfferAcc } from "./accounts";
import { distributeInstructions } from "./pump";
import { PROGRAM_ID, ata, auctionPda, configPda, deedStatePda, ix, offerPda, vaultPda } from "./program";
import { tokenFacts } from "./tokens";

const NONE = PublicKey.default;

export const budget = (units: number): TransactionInstruction[] => [
  ComputeBudgetProgram.setComputeUnitLimit({ units }),
  ...(config.priorityFee > 0 ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.priorityFee })] : []),
];

// ------------------------------------------------------------------ reads the writers need

export async function getDeedByCoin(ctx: TxContext, coinMint: string): Promise<DeedStateAcc> {
  const addr = deedStatePda(new PublicKey(coinMint));
  const info = await ctx.connection.getAccountInfo(addr);
  if (!info || !info.owner.equals(PROGRAM_ID)) throw new DeedRuleError("NO_DEED", "That coin has no Deed registered with the Deed program.");
  return decodeDeedState(addr, info);
}

export async function getAuctionAcc(ctx: TxContext, address: string): Promise<AuctionAcc> {
  const key = new PublicKey(address);
  const info = await ctx.connection.getAccountInfo(key);
  if (!info || !info.owner.equals(PROGRAM_ID)) throw new DeedRuleError("NO_AUCTION", "That auction does not exist (it may have been closed).");
  return decodeAuction(key, info);
}

async function getOfferAcc(ctx: TxContext, address: string): Promise<OfferAcc> {
  const key = new PublicKey(address);
  const info = await ctx.connection.getAccountInfo(key);
  if (!info || !info.owner.equals(PROGRAM_ID)) throw new DeedRuleError("NO_OFFER", "That offer is no longer open (it was filled, cancelled or rejected).");
  return decodeOffer(key, info);
}

async function treasuryOf(ctx: TxContext): Promise<PublicKey> {
  const info = await ctx.connection.getAccountInfo(configPda());
  if (!info) throw new DeedRuleError("NOT_INITIALISED", "The Deed program has not been initialised on this network.");
  return new PublicKey(decodeConfig(info).treasury);
}

async function tokenProgramOf(ctx: TxContext, mint: string): Promise<PublicKey> {
  const f = await tokenFacts(ctx.connection, mint);
  if (!f) throw new DeedRuleError("NO_MINT", "That address is not a token mint on this network.");
  return new PublicKey(f.tokenProgram);
}

const randomNonce = () => {
  // unique per maker; < 2^63
  const r = BigInt(Math.floor(Math.random() * 2 ** 30));
  return (BigInt(Date.now()) << 20n) ^ r;
};

/** Does the transaction fit in one packet? (measured exactly, with placeholder signatures) */
function fits(ctx: TxContext, tx: Transaction): boolean {
  try {
    tx.feePayer = new PublicKey(ctx.wallet);
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ the Deed

/**
 * Pays out a coin's accrued creator fees to the Deed holder. Pump's side (sweep + distribute into the Deed vault) is
 * permissionless and is bundled with the Deed program's `claim_fees` in the same transaction when it fits.
 */
export async function claimFees(ctx: TxContext, coinMint: string): Promise<string> {
  const conn = ctx.connection;
  const wallet = new PublicKey(ctx.wallet);
  const deed = await getDeedByCoin(ctx, coinMint);
  const coin = new PublicKey(coinMint);
  const vault = vaultPda(coin);
  const deedMint = new PublicKey(deed.deedMint);
  const deedTokenProgram = await tokenProgramOf(ctx, deed.deedMint);
  const deedToken = ata(wallet, deedMint, deedTokenProgram);

  const holding = await conn.getTokenAccountBalance(deedToken).catch(() => null);
  if (!holding || holding.value.amount !== "1") throw new DeedRuleError("NOT_HOLDER", "Only the wallet that holds the Deed can claim its fees.");

  const { instructions } = await distributeInstructions(conn, wallet, coin);
  const claim = ix("claim_fees", {}, { claimant: wallet, deed_state: deedStatePda(coin), vault, deed_token: deedToken });
  const floor = await conn.getMinimumBalanceForRentExemption(0);
  const inVault = (await conn.getBalance(vault)) - floor;
  if (instructions.length === 0 && inVault <= 0) throw new DeedRuleError("NOTHING_TO_CLAIM", "There are no fees to claim yet. They accrue as the coin trades.");

  const one = new Transaction().add(...budget(450_000), ...instructions, claim);
  if (fits(ctx, one)) return ctx.send(one);
  if (instructions.length) await ctx.send(new Transaction().add(...budget(400_000), ...instructions));
  return ctx.send(new Transaction().add(...budget(100_000), claim));
}

// ------------------------------------------------------------------ auctions

export async function createAuction(ctx: TxContext, coinMint: string, startPrice: bigint, durationSecs: number): Promise<{ signature: string; auction: string }> {
  const wallet = new PublicKey(ctx.wallet);
  const deed = await getDeedByCoin(ctx, coinMint);
  const deedMint = new PublicKey(deed.deedMint);
  const tp = await tokenProgramOf(ctx, deed.deedMint);
  const sellerAta = ata(wallet, deedMint, tp);
  const bal = await ctx.connection.getTokenAccountBalance(sellerAta).catch(() => null);
  if (!bal || bal.value.amount !== "1") throw new DeedRuleError("NOT_HOLDER", "You do not hold this Deed, so you cannot list it.");
  const auction = auctionPda(deedMint, deed.auctionCount);
  const create = ix(
    "create_auction",
    { start_price: startPrice, duration_secs: BigInt(durationSecs) },
    {
      seller: wallet,
      deed_state: new PublicKey(deed.address),
      deed_mint: deedMint,
      seller_deed_account: sellerAta,
      auction,
      escrow: ata(auction, deedMint, tp),
      token_program: tp,
    },
  );
  const signature = await ctx.send(new Transaction().add(...budget(200_000), create));
  return { signature, auction: auction.toBase58() };
}

export async function placeBid(ctx: TxContext, auctionAddr: string, amount: bigint): Promise<string> {
  const wallet = new PublicKey(ctx.wallet);
  const a = await getAuctionAcc(ctx, auctionAddr);
  const bid = ix(
    "place_bid",
    { amount },
    {
      bidder: wallet,
      auction: new PublicKey(auctionAddr),
      // the outbid wallet is refunded inside this very transaction; for a first bid the account is ignored
      previous_bidder: a.highestBidder ? new PublicKey(a.highestBidder) : wallet,
    },
  );
  return ctx.send(new Transaction().add(...budget(100_000), bid));
}

export async function settleAuction(ctx: TxContext, auctionAddr: string): Promise<string> {
  const wallet = new PublicKey(ctx.wallet);
  const a = await getAuctionAcc(ctx, auctionAddr);
  if (!a.highestBidder) throw new DeedRuleError("NO_BIDS", "This auction ended without a bid. Cancel it to get the Deed back.");
  const deedMint = new PublicKey(a.deedMint);
  const tp = await tokenProgramOf(ctx, a.deedMint);
  const auction = new PublicKey(auctionAddr);
  const winner = new PublicKey(a.highestBidder);
  const settle = ix(
    "settle_auction",
    {},
    {
      caller: wallet,
      config: configPda(),
      treasury: await treasuryOf(ctx),
      auction,
      seller: new PublicKey(a.seller),
      winner,
      deed_mint: deedMint,
      escrow: ata(auction, deedMint, tp),
      winner_deed_account: ata(winner, deedMint, tp),
      token_program: tp,
    },
  );
  return ctx.send(new Transaction().add(...budget(250_000), settle));
}

export async function cancelAuction(ctx: TxContext, auctionAddr: string): Promise<string> {
  const wallet = new PublicKey(ctx.wallet);
  const a = await getAuctionAcc(ctx, auctionAddr);
  const deedMint = new PublicKey(a.deedMint);
  const tp = await tokenProgramOf(ctx, a.deedMint);
  const auction = new PublicKey(auctionAddr);
  const cancel = ix(
    "cancel_auction",
    {},
    { seller: wallet, auction, deed_mint: deedMint, escrow: ata(auction, deedMint, tp), seller_deed_account: ata(wallet, deedMint, tp), token_program: tp },
  );
  return ctx.send(new Transaction().add(...budget(250_000), cancel));
}

// ------------------------------------------------------------------ OTC

export interface OfferParams {
  kind: "SELL" | "BUY";
  mint: string;
  amount: bigint;
  priceTotal: bigint;
  minFill: bigint;
  expiresInSecs: number;
  counterparty: string | null;
  parent: string | null;
}

export async function createOffer(ctx: TxContext, p: OfferParams): Promise<{ signature: string; offer: string }> {
  const wallet = new PublicKey(ctx.wallet);
  const mint = new PublicKey(p.mint);
  const tp = await tokenProgramOf(ctx, p.mint);
  const nonce = randomNonce();
  const offer = offerPda(wallet, nonce);
  const args = {
    args: {
      nonce,
      amount: p.amount,
      price_total: p.priceTotal,
      min_fill: p.minFill,
      expires_in_secs: BigInt(p.expiresInSecs),
      counterparty: p.counterparty ? new PublicKey(p.counterparty) : NONE,
      parent: p.parent ? new PublicKey(p.parent) : NONE,
    },
  };
  const create =
    p.kind === "SELL"
      ? ix("create_sell_offer", args, { maker: wallet, mint, maker_token_account: ata(wallet, mint, tp), offer, escrow: ata(offer, mint, tp), token_program: tp })
      : ix("create_buy_offer", args, { maker: wallet, mint, offer, token_program: tp });
  const signature = await ctx.send(new Transaction().add(...budget(250_000), create));
  return { signature, offer: offer.toBase58() };
}

export async function fillOffer(ctx: TxContext, offerAddr: string, amount: bigint): Promise<string> {
  const wallet = new PublicKey(ctx.wallet);
  const o = await getOfferAcc(ctx, offerAddr);
  const mint = new PublicKey(o.mint);
  const tp = new PublicKey(o.tokenProgram);
  const offer = new PublicKey(offerAddr);
  const maker = new PublicKey(o.maker);
  if (o.kind === "Buy") {
    const held = await ctx.connection.getTokenAccountBalance(ata(wallet, mint, tp)).catch(() => null);
    if (!held || BigInt(held.value.amount) < amount) throw new DeedRuleError("NO_TOKENS", "You don’t hold enough of this token to sell into this bid.");
  }
  const common = { taker: wallet, config: configPda(), treasury: await treasuryOf(ctx), maker, offer, mint, token_program: tp };
  const fill =
    o.kind === "Sell"
      ? ix("fill_sell_offer", { amount }, { ...common, escrow: ata(offer, mint, tp), taker_token_account: ata(wallet, mint, tp) })
      : ix("fill_buy_offer", { amount }, { ...common, taker_token_account: ata(wallet, mint, tp), maker_token_account: ata(maker, mint, tp) });
  return ctx.send(new Transaction().add(...budget(250_000), fill));
}

/** Cancel (maker) or reject (the named counterparty): returns the escrow to the maker and closes the offer. */
export async function closeOffer(ctx: TxContext, offerAddr: string): Promise<string> {
  const wallet = new PublicKey(ctx.wallet);
  const o = await getOfferAcc(ctx, offerAddr);
  const mint = new PublicKey(o.mint);
  const tp = new PublicKey(o.tokenProgram);
  const offer = new PublicKey(offerAddr);
  const maker = new PublicKey(o.maker);
  const close =
    o.kind === "Sell"
      ? ix("close_sell_offer", {}, { closer: wallet, maker, offer, mint, escrow: ata(offer, mint, tp), maker_token_account: ata(maker, mint, tp), token_program: tp })
      : ix("close_buy_offer", {}, { closer: wallet, maker, offer });
  return ctx.send(new Transaction().add(...budget(250_000), close));
}
