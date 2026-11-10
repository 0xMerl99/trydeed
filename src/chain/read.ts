/**
 * Everything the UI reads, derived from real chain data: the Deed program's accounts (what exists now), its events (what
 * happened), Pump's accounts (fees, market cap) and the token programs (holders, metadata). No server, no cache that
 * can disagree with the chain for more than a few seconds.
 */
import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { ALLOWED_EXTENSIONS, offchainMeta, tokenFacts, type TokenFacts } from "./tokens";
import { fetchAllAuctions, fetchAllDeeds, fetchAllOffers, type AuctionAcc, type DeedStateAcc, type OfferAcc } from "./accounts";
import { loadEvents, type ChainEvent } from "./events";
import { bondingCurvePda, creatorVaultPda, decodeCurve, marketCapLamports, sharingConfigPda } from "./pump";
import { PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ata, auctionPda, vaultPda } from "./program";
import { auctionPhase } from "@/lib/auction";
import { isRpcUnavailable } from "@/lib/errors";
import type { OfferKind } from "@/lib/otc";
import type {
  ActivityEvent,
  Auction,
  AuctionDetail,
  Bid,
  Coin,
  Notification,
  OfferState,
  OtcFill,
  OtcMarketRow,
  OtcMine,
  OtcOffer,
  OtcOfferDetail,
  OtcStats,
  OtcToken,
  OtcTokenMarket,
  OtcTrade,
  Portfolio,
  PortfolioBid,
} from "@/types";

const AUCTION_FEE_BPS = 100;
const OTC_FEE_BPS = 50;
const SNAPSHOT_TTL = 8_000;
const HOLDER_TTL = 30_000;

interface Snapshot {
  at: number;
  now: number;
  deeds: DeedStateAcc[];
  auctions: AuctionAcc[];
  offers: OfferAcc[];
  events: ChainEvent[];
}

export class ChainReader {
  private snap: { at: number; p: Promise<Snapshot> } | null = null;
  private coinCache: { at: number; p: Promise<Coin[]> } | null = null;
  private holders = new Map<string, { at: number; p: Promise<string | null> }>();

  constructor(
    readonly conn: Connection,
    private clock: () => Promise<number>,
  ) {}

  private deployedCache: { at: number; p: Promise<boolean> } | null = null;
  private warned = false;

  /**
   * Is the Deed program actually on this network? A single `getAccountInfo` (which every RPC allows). If it is not
   * deployed there is nothing to scan, so the app shows its normal empty pages instead of asking the RPC for a
   * `getProgramAccounts` scan that public endpoints refuse.
   */
  isDeployed(): Promise<boolean> {
    const hit = this.deployedCache;
    if (hit && Date.now() - hit.at < SNAPSHOT_TTL) return hit.p;
    const p = this.conn.getAccountInfo(PROGRAM_ID).then((a) => !!a?.executable);
    this.deployedCache = { at: Date.now(), p };
    p.catch(() => {
      if (this.deployedCache?.p === p) this.deployedCache = null;
    });
    return p;
  }

  /** Drop every cache: called after the app's own writes so the next read sees them. */
  invalidate() {
    this.deployedCache = null;
    this.snap = null;
    this.coinCache = null;
    this.holders.clear();
  }

  snapshot(): Promise<Snapshot> {
    if (this.snap && Date.now() - this.snap.at < SNAPSHOT_TTL) return this.snap.p;
    const empty = async (): Promise<Snapshot> => ({ at: Date.now(), now: await this.clock().catch(() => Math.floor(Date.now() / 1000)), deeds: [], auctions: [], offers: [], events: [] });
    const p = (async (): Promise<Snapshot> => {
      try {
        if (!(await this.isDeployed())) return await empty();
        const [now, deeds, auctions, offers, events] = await Promise.all([
          this.clock(),
          fetchAllDeeds(this.conn),
          fetchAllAuctions(this.conn),
          fetchAllOffers(this.conn),
          loadEvents(this.conn, PROGRAM_ID, 150).catch(() => [] as ChainEvent[]),
        ]);
        return { at: Date.now(), now, deeds, auctions, offers, events };
      } catch (e) {
        // An RPC that refuses or cannot be reached has no data to give: show the normal empty pages, not an error box.
        if (!isRpcUnavailable(e)) throw e;
        if (!this.warned) console.warn("Deed: the Solana RPC endpoint is unavailable, so no data is shown. Set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated RPC.");
        this.warned = true;
        return empty();
      }
    })();
    this.snap = { at: Date.now(), p };
    p.catch(() => {
      if (this.snap?.p === p) this.snap = null;
    });
    return p;
  }

  // ---------------------------------------------------------------- holders

  /** Wallet that holds the Deed (the owner of the token account that holds the single token). */
  private holderOf(deedMint: string): Promise<string | null> {
    const hit = this.holders.get(deedMint);
    if (hit && Date.now() - hit.at < HOLDER_TTL) return hit.p;
    const p = (async () => {
      const largest = await this.conn.getTokenLargestAccounts(new PublicKey(deedMint));
      const top = largest.value.find((a) => a.amount === "1");
      if (!top) return null;
      const info = await this.conn.getParsedAccountInfo(top.address);
      const parsed = (info.value?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed;
      return parsed?.info?.owner ?? null;
    })().catch(() => null);
    this.holders.set(deedMint, { at: Date.now(), p });
    return p;
  }

  // ---------------------------------------------------------------- coins

  coins(): Promise<Coin[]> {
    if (this.coinCache && Date.now() - this.coinCache.at < SNAPSHOT_TTL) return this.coinCache.p;
    const p = this.buildCoins();
    this.coinCache = { at: Date.now(), p };
    p.catch(() => {
      if (this.coinCache?.p === p) this.coinCache = null;
    });
    return p;
  }

  private async buildCoins(): Promise<Coin[]> {
    const s = await this.snapshot();
    if (!s.deeds.length) return [];
    const keys: PublicKey[] = [];
    for (const d of s.deeds) {
      const coin = new PublicKey(d.coinMint);
      keys.push(vaultPda(coin), bondingCurvePda(coin), creatorVaultPda(sharingConfigPda(coin)));
    }
    const infos: (AccountInfo<Buffer> | null)[] = [];
    for (let i = 0; i < keys.length; i += 99) infos.push(...(await this.conn.getMultipleAccountsInfo(keys.slice(i, i + 99))));
    const rent0 = BigInt(await this.conn.getMinimumBalanceForRentExemption(0));

    return Promise.all(
      s.deeds.map(async (d, i): Promise<Coin> => {
        const [vaultInfo, curveInfo, pumpVaultInfo] = [infos[i * 3], infos[i * 3 + 1], infos[i * 3 + 2]];
        const facts = await tokenFacts(this.conn, d.coinMint);
        const meta = await offchainMeta(facts?.uri);
        const live = s.auctions.find((a) => a.deedMint === d.deedMint && a.status === "Live");
        const sales = countSales(s, d.deedMint);
        const owner = live ? live.address : ((await this.holderOf(d.deedMint)) ?? d.creator);
        const inVault = BigInt(vaultInfo?.lamports ?? 0) - rent0;
        const curve = curveInfo ? decodeCurve(curveInfo.data) : null;
        let pending = curve?.creatorFeeUnswept ?? 0n;
        if (pumpVaultInfo) {
          const floor = BigInt(await this.conn.getMinimumBalanceForRentExemption(pumpVaultInfo.data.length));
          const extra = BigInt(pumpVaultInfo.lamports) - floor;
          if (extra > 0n) pending += extra;
        }
        const claimable = (inVault > 0n ? inVault : 0n) + pending;
        return {
          mint: d.coinMint,
          name: facts?.name || "Unnamed coin",
          symbol: facts?.symbol || "?",
          image: meta.image,
          description: meta.description ?? "",
          links: { twitter: meta.twitter, telegram: meta.telegram, website: meta.website },
          creator: d.creator,
          deedMint: d.deedMint,
          deedOwner: owner,
          createdAt: d.registeredAt,
          launchedAt: d.registeredAt,
          fees: { lifetime: d.claimedTotal + claimable, d24: null, d7: null, claimed: d.claimedTotal, unclaimed: claimable, claimable },
          market: { marketCapSol: curve ? marketCapLamports(curve) : null },
          status: live ? "ON_AUCTION" : sales > 0 ? "SOLD" : "HELD",
          liveAuction: live?.address ?? null,
          sales,
        };
      }),
    );
  }

  // ---------------------------------------------------------------- auctions

  private toAuction(a: AuctionAcc, coin: Coin, s: Snapshot): Auction {
    const bidders = new Set(s.events.filter((e) => e.kind === "BidPlaced" && e.auction === a.address).map((e) => (e as Extract<ChainEvent, { kind: "BidPlaced" }>).bidder));
    return {
      address: a.address,
      coinMint: a.coinMint,
      deedMint: a.deedMint,
      seller: a.seller,
      startPrice: a.startPrice,
      highestBid: a.status === "Settled" ? a.finalPrice : a.highestBid,
      highestBidder: a.highestBidder,
      bidCount: a.bidCount,
      bidders: Math.max(bidders.size, a.bidCount > 0 ? 1 : 0),
      startTs: a.startTime,
      endTs: a.endTime,
      status: a.status === "Live" ? "LIVE" : a.status === "Settled" ? "SETTLED" : a.bidCount === 0 && s.now >= a.endTime ? "UNSOLD" : "CANCELLED",
      feeBps: AUCTION_FEE_BPS,
      coin,
    };
  }

  async auctions(): Promise<Auction[]> {
    const [s, coins] = await Promise.all([this.snapshot(), this.coins()]);
    const byMint = new Map(coins.map((c) => [c.mint, c]));
    const out: Auction[] = [];
    const seen = new Set<string>();
    for (const a of s.auctions) {
      const coin = byMint.get(a.coinMint);
      if (!coin) continue;
      out.push(this.toAuction(a, coin, s));
      seen.add(a.address);
    }
    // finished auctions whose account the seller reclaimed: their sale is still in the program's event history
    for (const e of s.events) {
      if (e.kind !== "AuctionSettled" || seen.has(e.auction)) continue;
      const coin = byMint.get(e.coinMint);
      if (!coin) continue;
      const created = s.events.find((x): x is Extract<ChainEvent, { kind: "AuctionCreated" }> => x.kind === "AuctionCreated" && x.auction === e.auction);
      const bids = s.events.filter((x): x is Extract<ChainEvent, { kind: "BidPlaced" }> => x.kind === "BidPlaced" && x.auction === e.auction);
      out.push({
        address: e.auction,
        coinMint: e.coinMint,
        deedMint: e.deedMint,
        seller: e.seller,
        startPrice: created?.startPrice ?? 0n,
        highestBid: e.price,
        highestBidder: e.winner,
        bidCount: bids.length,
        bidders: new Set(bids.map((b) => b.bidder)).size || 1,
        startTs: created?.startTime ?? e.ts,
        endTs: bids.length ? Math.max(...bids.map((b) => b.endTime)) : e.ts,
        status: "SETTLED",
        feeBps: AUCTION_FEE_BPS,
        coin,
      });
      seen.add(e.auction);
    }
    return out;
  }

  async auctionDetail(address: string): Promise<AuctionDetail> {
    const all = await this.auctions();
    const auction = all.find((a) => a.address === address);
    if (!auction) throw new Error("That auction does not exist on this network.");
    const events = await loadEvents(this.conn, new PublicKey(address), 100).catch(() => [] as ChainEvent[]);
    // `events` is newest-first (by slot); reverse it for oldest-first, which also orders bids landing in the same second
    const history: Bid[] = [...events]
      .reverse()
      .filter((e): e is Extract<ChainEvent, { kind: "BidPlaced" }> => e.kind === "BidPlaced")
      .map((e) => ({ auction: address, bidder: e.bidder, amount: e.amount, ts: e.ts, extended: e.extended, ref: e.sig }));
    const latest = new Map<string, bigint>();
    for (const b of history) latest.set(b.bidder, b.amount);
    return {
      auction: history.length ? { ...auction, bidders: Math.max(auction.bidders, latest.size) } : auction,
      history,
      bids: [...latest.entries()].map(([bidder, amount]) => ({ bidder, amount })),
    };
  }

  // ---------------------------------------------------------------- activity

  async activity(): Promise<ActivityEvent[]> {
    const [s, coins] = await Promise.all([this.snapshot(), this.coins()]);
    const byMint = new Map(coins.map((c) => [c.mint, c]));
    const out: ActivityEvent[] = [];
    for (const e of s.events) {
      const base = { id: `${e.sig}:${out.length}`, ts: e.ts, ref: e.sig };
      switch (e.kind) {
        case "DeedRegistered": {
          const c = byMint.get(e.coinMint);
          out.push({ ...base, kind: "COIN_LAUNCHED", actor: e.creator, symbol: c?.symbol, image: c?.image, coinMint: e.coinMint });
          break;
        }
        case "AuctionCreated": {
          const c = byMint.get(e.coinMint);
          out.push({ ...base, kind: "AUCTION_CREATED", actor: e.seller, symbol: c?.symbol, image: c?.image, amount: e.startPrice, auction: e.auction, coinMint: e.coinMint });
          break;
        }
        case "BidPlaced": {
          const a = s.auctions.find((x) => x.address === e.auction);
          const c = a ? byMint.get(a.coinMint) : undefined;
          out.push({ ...base, kind: "BID_PLACED", actor: e.bidder, symbol: c?.symbol, image: c?.image, amount: e.amount, auction: e.auction, coinMint: c?.mint });
          break;
        }
        case "AuctionSettled": {
          const c = byMint.get(e.coinMint);
          out.push({ ...base, kind: "AUCTION_SETTLED", actor: e.seller, counterparty: e.winner, symbol: c?.symbol, image: c?.image, amount: e.price, auction: e.auction, coinMint: e.coinMint });
          break;
        }
        case "AuctionCancelled": {
          const a = s.auctions.find((x) => x.address === e.auction);
          const c = byMint.get(a?.coinMint ?? "");
          out.push({ ...base, kind: "AUCTION_CANCELLED", actor: e.seller, symbol: c?.symbol, image: c?.image, auction: e.auction, coinMint: c?.mint });
          break;
        }
        case "FeesClaimed": {
          const c = byMint.get(e.coinMint);
          out.push({ ...base, kind: "FEES_CLAIMED", actor: e.claimant, symbol: c?.symbol, image: c?.image, amount: e.amount, coinMint: e.coinMint });
          break;
        }
        case "OfferCreated": {
          const t = await tokenFacts(this.conn, e.mint);
          out.push({ ...base, kind: "OTC_OFFER_CREATED", actor: e.maker, symbol: t?.symbol, amount: e.price, offer: e.offer, otcMint: e.mint });
          break;
        }
        case "OfferFilled": {
          const t = await tokenFacts(this.conn, e.mint);
          out.push({ ...base, kind: "OTC_OFFER_FILLED", actor: e.taker, counterparty: e.maker, symbol: t?.symbol, amount: e.lamports, offer: e.offer, otcMint: e.mint });
          break;
        }
        default:
          break;
      }
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  // ---------------------------------------------------------------- portfolio

  async portfolio(wallet: string): Promise<Portfolio> {
    const [s, coins, auctions, activity] = await Promise.all([this.snapshot(), this.coins(), this.auctions(), this.activity()]);
    const mine = coins.filter((c) => c.creator === wallet);
    const assets = coins.filter((c) => c.deedOwner === wallet);
    const bids: PortfolioBid[] = [];
    for (const a of auctions) {
      if (a.highestBidder !== wallet) continue;
      if (a.status === "LIVE" || a.status === "SETTLED") bids.push({ auction: a.address, amount: a.highestBid, status: a.status === "SETTLED" ? "WON" : "HIGHEST", auctionView: a });
    }
    return {
      wallet,
      coins: mine,
      assets,
      auctions: auctions.filter((a) => a.seller === wallet),
      bids,
      history: activity.filter((e) => e.actor === wallet || e.counterparty === wallet),
    };
    void s;
  }

  // ---------------------------------------------------------------- OTC

  private async otcToken(mint: string, deedCoins: Set<string>): Promise<OtcToken> {
    const f: TokenFacts | null = await tokenFacts(this.conn, mint);
    if (!f) {
      return { mint, decimals: 0, standard: "SPL Token", supply: 0n, mintAuthority: null, freezeAuthority: null, platformCoin: false, supported: false, reason: "This address is not a token mint on this network.", warnings: [] };
    }
    const meta = await offchainMeta(f.uri);
    const warnings: string[] = [];
    let reason: string | undefined;
    if (f.freezeAuthority) reason = "This token has a freeze authority, which could freeze escrowed tokens, so it cannot be traded OTC.";
    const bad = f.extensions.filter((e) => !ALLOWED_EXTENSIONS.has(e));
    if (!reason && bad.length) reason = `This Token-2022 mint uses extensions that can move or alter escrowed tokens (${bad.join(", ")}), so it cannot be traded OTC.`;
    if (f.mintAuthority) warnings.push("The mint authority is still set: more of this token can be created.");
    return {
      mint,
      symbol: f.symbol,
      name: f.name,
      image: meta.image,
      decimals: f.decimals,
      standard: f.standard,
      supply: f.supply,
      mintAuthority: f.mintAuthority,
      freezeAuthority: f.freezeAuthority,
      platformCoin: deedCoins.has(mint),
      supported: !reason,
      reason,
      transferFee: f.extensions.includes("transferFeeConfig"),
      warnings,
    };
  }

  private async toOffer(o: OfferAcc, s: Snapshot, deedCoins: Set<string>): Promise<OtcOffer> {
    const token = await this.otcToken(o.mint, deedCoins);
    const fills = offerFills(s.events, o.address);
    const created = s.events.find((e) => e.kind === "OfferCreated" && e.offer === o.address);
    let state: OfferState = "ACTIVE";
    if (o.remaining < o.amountTotal) state = "PARTIALLY_FILLED";
    if (s.now >= o.expiresAt) state = "EXPIRED";
    return {
      address: o.address,
      kind: o.kind === "Sell" ? "SELL" : "BUY",
      mint: o.mint,
      maker: o.maker,
      counterparty: o.counterparty,
      amountTotal: o.amountTotal,
      remaining: o.remaining,
      priceTotal: o.priceTotal,
      priceRemaining: o.priceRemaining,
      minFill: o.minFill,
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      state,
      live: true,
      feeBps: o.feeBps,
      parent: o.parent,
      fills,
      createdRef: created?.sig ?? "",
      token,
    };
  }

  private async deedCoinSet(): Promise<Set<string>> {
    return new Set((await this.snapshot()).deeds.map((d) => d.coinMint));
  }

  async offers(): Promise<OtcOffer[]> {
    const [s, set] = await Promise.all([this.snapshot(), this.deedCoinSet()]);
    return Promise.all(s.offers.map((o) => this.toOffer(o, s, set)));
  }

  private trades(s: Snapshot, offers: OtcOffer[], tokens: Map<string, OtcToken>): OtcTrade[] {
    void offers;
    return s.events
      .filter((e): e is Extract<ChainEvent, { kind: "OfferFilled" }> => e.kind === "OfferFilled")
      .map((e) => ({
        mint: e.mint,
        token: tokens.get(e.mint) ?? ({ mint: e.mint, decimals: 0, standard: "SPL Token", supply: 0n, mintAuthority: null, freezeAuthority: null, platformCoin: false, supported: true, warnings: [] } as OtcToken),
        offer: e.offer,
        maker: e.maker,
        taker: e.taker,
        kind: (e.side === "Sell" ? "SELL" : "BUY") as OfferKind,
        amount: e.amount,
        lamports: e.lamports,
        fee: e.fee,
        ts: e.ts,
        ref: e.sig,
      }));
  }

  private async tokenMap(mints: string[]): Promise<Map<string, OtcToken>> {
    const set = await this.deedCoinSet();
    const entries = await Promise.all([...new Set(mints)].map(async (m) => [m, await this.otcToken(m, set)] as const));
    return new Map(entries);
  }

  async otcStats(): Promise<OtcStats> {
    const [s, offers] = await Promise.all([this.snapshot(), this.offers()]);
    const live = offers.filter((o) => o.state !== "EXPIRED");
    const fills = s.events.filter((e): e is Extract<ChainEvent, { kind: "OfferFilled" }> => e.kind === "OfferFilled");
    const tokens = await this.tokenMap(fills.map((f) => f.mint));
    const trades = this.trades(s, offers, tokens);
    return {
      activeOffers: live.filter((o) => o.kind === "SELL").length,
      activeBids: live.filter((o) => o.kind === "BUY").length,
      trades: trades.length,
      volume: trades.reduce((a, t) => a + t.lamports, 0n),
      feeBps: OTC_FEE_BPS,
      recent: trades.slice(0, 10),
    };
  }

  async otcMarkets(): Promise<OtcMarketRow[]> {
    const [s, offers] = await Promise.all([this.snapshot(), this.offers()]);
    const byMint = new Map<string, OtcOffer[]>();
    for (const o of offers.filter((x) => x.state !== "EXPIRED")) byMint.set(o.mint, [...(byMint.get(o.mint) ?? []), o]);
    const rows: OtcMarketRow[] = [];
    for (const [mint, list] of byMint) {
      const token = list[0].token;
      const asks = list.filter((o) => o.kind === "SELL");
      const bids = list.filter((o) => o.kind === "BUY");
      const px = (o: OtcOffer) => perWholeToken(o.priceRemaining, o.remaining, token.decimals);
      const fills = s.events.filter((e): e is Extract<ChainEvent, { kind: "OfferFilled" }> => e.kind === "OfferFilled" && e.mint === mint);
      const dayAgo = s.now - 86_400;
      rows.push({
        token,
        mint,
        bestAsk: asks.length ? asks.map(px).reduce((a, b) => (a < b ? a : b)) : null,
        bestBid: bids.length ? bids.map(px).reduce((a, b) => (a > b ? a : b)) : null,
        asks: asks.length,
        bids: bids.length,
        volume24h: fills.filter((f) => f.ts >= dayAgo).reduce((a, f) => a + f.lamports, 0n),
        lastTradeTs: fills.length ? Math.max(...fills.map((f) => f.ts)) : null,
        firstSeen: Math.min(...list.map((o) => o.createdAt)),
      });
    }
    return rows.sort((a, b) => b.asks + b.bids - (a.asks + a.bids));
  }

  async otcToken_(mint: string): Promise<OtcTokenMarket> {
    const [s, offers] = await Promise.all([this.snapshot(), this.offers()]);
    const token = (await this.tokenMap([mint])).get(mint)!;
    const list = offers.filter((o) => o.mint === mint && o.state !== "EXPIRED");
    const px = (o: OtcOffer) => perWholeToken(o.priceRemaining, o.remaining, token.decimals);
    const asks = list.filter((o) => o.kind === "SELL").sort((a, b) => cmp(px(a), px(b)));
    const bids = list.filter((o) => o.kind === "BUY").sort((a, b) => cmp(px(b), px(a)));
    const tokens = new Map([[mint, token]]);
    const trades = this.trades(s, offers, tokens).filter((t) => t.mint === mint);
    const dayAgo = s.now - 86_400;
    const d = trades.filter((t) => t.ts >= dayAgo);
    return {
      token,
      asks,
      bids,
      trades,
      bestAsk: asks.length ? px(asks[0]) : null,
      bestBid: bids.length ? px(bids[0]) : null,
      volume24h: d.reduce((a, t) => a + t.lamports, 0n),
      trades24h: d.length,
      feeBps: OTC_FEE_BPS,
    };
  }

  /** One offer, open or finished. A finished offer's account is gone, so its story is rebuilt from its own events. */
  async offerDetail(address: string): Promise<OtcOfferDetail> {
    const [s, set] = await Promise.all([this.snapshot(), this.deedCoinSet()]);
    const open = s.offers.find((o) => o.address === address);
    let offer: OtcOffer;
    if (open) {
      offer = await this.toOffer(open, s, set);
    } else {
      const ev = await loadEvents(this.conn, new PublicKey(address), 100);
      const created = ev.find((e): e is Extract<ChainEvent, { kind: "OfferCreated" }> => e.kind === "OfferCreated");
      if (!created) throw new Error("That offer does not exist on this network.");
      const closed = ev.find((e): e is Extract<ChainEvent, { kind: "OfferClosed" }> => e.kind === "OfferClosed");
      const fills = offerFills(ev, address);
      const filled = fills.reduce((a, f) => a + f.amount, 0n);
      const paid = fills.reduce((a, f) => a + f.lamports, 0n);
      const remaining = created.amount - filled;
      offer = {
        address,
        kind: created.side === "Sell" ? "SELL" : "BUY",
        mint: created.mint,
        maker: created.maker,
        counterparty: created.counterparty,
        amountTotal: created.amount,
        remaining,
        priceTotal: created.price,
        priceRemaining: created.price - paid,
        minFill: created.minFill,
        createdAt: created.ts,
        expiresAt: created.expiresAt,
        state: closed ? (closed.status === "Rejected" ? "REJECTED" : "CANCELLED") : remaining === 0n ? "FILLED" : "EXPIRED",
        live: false,
        feeBps: OTC_FEE_BPS,
        parent: created.parent,
        fills,
        createdRef: created.sig,
        closedRef: closed?.sig ?? fills[fills.length - 1]?.ref,
        token: await this.otcToken(created.mint, set),
      };
    }
    // the negotiation thread: this offer, its parent chain and its counters
    const all = await this.offers();
    const thread: OtcOffer[] = [offer];
    for (let cur: OtcOffer | undefined = offer; cur?.parent; ) {
      const parent: OtcOffer | undefined = all.find((o) => o.address === cur!.parent);
      if (!parent || thread.includes(parent)) break;
      thread.unshift(parent);
      cur = parent;
    }
    for (const o of all) if (o.parent === offer.address && !thread.includes(o)) thread.push(o);
    return { offer, negotiation: thread.length > 1 ? thread : [] };
  }

  async otcMine(wallet: string): Promise<OtcMine> {
    const [s, offers] = await Promise.all([this.snapshot(), this.offers()]);
    const fills = s.events.filter((e): e is Extract<ChainEvent, { kind: "OfferFilled" }> => e.kind === "OfferFilled" && (e.maker === wallet || e.taker === wallet));
    const tokens = await this.tokenMap(fills.map((f) => f.mint));
    return {
      made: offers.filter((o) => o.maker === wallet),
      received: offers.filter((o) => o.counterparty === wallet),
      trades: this.trades(s, offers, tokens).filter((t) => t.maker === wallet || t.taker === wallet),
    };
  }

  async notifications(wallet: string): Promise<Notification[]> {
    const [s, offers] = await Promise.all([this.snapshot(), this.offers()]);
    const out: Notification[] = [];
    const openAddr = new Set(offers.map((o) => o.address));
    for (const e of s.events) {
      const id = `${e.sig}:${e.kind}`;
      if (e.kind === "OfferCreated" && e.counterparty === wallet) {
        const t = await tokenFacts(this.conn, e.mint);
        out.push({ id, kind: e.parent ? "COUNTER_RECEIVED" : "OFFER_RECEIVED", ts: e.ts, offer: e.offer, mint: e.mint, symbol: t?.symbol, amount: e.amount, lamports: e.price });
      } else if (e.kind === "OfferFilled" && e.maker === wallet) {
        const t = await tokenFacts(this.conn, e.mint);
        out.push({ id, kind: e.remaining === 0n ? "OFFER_FILLED" : "OFFER_PARTIALLY_FILLED", ts: e.ts, offer: e.offer, mint: e.mint, symbol: t?.symbol, amount: e.amount, lamports: e.lamports });
      } else if (e.kind === "OfferClosed" && e.maker === wallet && e.status === "Rejected") {
        const created = s.events.find((x): x is Extract<ChainEvent, { kind: "OfferCreated" }> => x.kind === "OfferCreated" && x.offer === e.offer);
        const t = created ? await tokenFacts(this.conn, created.mint) : null;
        out.push({ id, kind: "OFFER_REJECTED", ts: e.ts, offer: e.offer, mint: created?.mint ?? "", symbol: t?.symbol });
      }
    }
    for (const o of offers) {
      if (o.maker === wallet && o.state === "EXPIRED") out.push({ id: `${o.address}:expired`, kind: "OFFER_EXPIRED", ts: o.expiresAt, offer: o.address, mint: o.mint, symbol: o.token.symbol, needsClose: openAddr.has(o.address) });
    }
    return out.sort((a, b) => b.ts - a.ts);
  }
}

// ------------------------------------------------------------------ helpers

function countSales(s: Snapshot, deedMint: string): number {
  const fromAccounts = new Set(s.auctions.filter((a) => a.deedMint === deedMint && a.status === "Settled").map((a) => a.address));
  for (const e of s.events) if (e.kind === "AuctionSettled" && e.deedMint === deedMint) fromAccounts.add(e.auction);
  return fromAccounts.size;
}

function offerFills(events: ChainEvent[], offer: string): OtcFill[] {
  return events
    .filter((e): e is Extract<ChainEvent, { kind: "OfferFilled" }> => e.kind === "OfferFilled" && e.offer === offer)
    .map((e) => ({ taker: e.taker, amount: e.amount, lamports: e.lamports, fee: e.fee, ts: e.ts, ref: e.sig }))
    .sort((a, b) => a.ts - b.ts);
}

/** Lamports per WHOLE token for a remaining slice of an offer (floor); used only to rank and display prices. */
function perWholeToken(lamports: bigint, amount: bigint, decimals: number): bigint {
  return amount === 0n ? 0n : (lamports * 10n ** BigInt(decimals)) / amount;
}
const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

export { auctionPhase, ata, auctionPda, TOKEN_2022_PROGRAM_ID };
