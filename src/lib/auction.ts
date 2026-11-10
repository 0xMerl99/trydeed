import { LAMPORTS_PER_SOL, sol } from "./sol";

/**
 * Deed auction rules — the single source of truth for the UI.
 *
 * IMPORTANT: these mirror the *product rules*. In live mode the on-chain program is authoritative for the end time,
 * the minimum bid and anti-sniping; the UI uses these only to pre-validate and to explain.
 */
export const AUCTION_RULES = {
  /** 1% platform fee, charged to the seller, on COMPLETED sales only. */
  feeBps: 100n,
  /** Each bid must beat the current bid by 5% … */
  minIncrementBps: 500n,
  /** … or 0.1 SOL, whichever is greater. */
  minIncrementLamports: LAMPORTS_PER_SOL / 10n,
  /** A bid inside the final five minutes pushes the end out by five minutes. */
  antiSnipeSecs: 300,
  /** Smallest starting bid a seller may set (carried over from the reference product; confirm with the program). */
  minStartLamports: LAMPORTS_PER_SOL / 100n,
} as const;

export type AuctionStatus = "LIVE" | "SETTLED" | "CANCELLED" | "UNSOLD";
/** `ENDED` = the clock ran out but nobody has settled it yet. */
export type AuctionPhase = "LIVE" | "ENDED" | "SETTLED" | "CANCELLED" | "UNSOLD";

export interface AuctionLike {
  status: AuctionStatus;
  startPrice: bigint;
  highestBid: bigint;
  bidCount: number;
  endTs: number;
}

/** MAX(current × 5%, 0.1 SOL). The 5% share is rounded UP to the next lamport so the rule is never under-enforced. */
export function minIncrement(current: bigint): bigint {
  const pct = (current * AUCTION_RULES.minIncrementBps + 9_999n) / 10_000n;
  return pct > AUCTION_RULES.minIncrementLamports ? pct : AUCTION_RULES.minIncrementLamports;
}

/** First bid: at least the starting price. After that: current bid + MAX(5%, 0.1 SOL). */
export function minNextBid(a: Pick<AuctionLike, "bidCount" | "highestBid" | "startPrice">): bigint {
  return a.bidCount === 0 ? a.startPrice : a.highestBid + minIncrement(a.highestBid);
}

/** The price currently shown to bidders. */
export const currentBid = (a: Pick<AuctionLike, "bidCount" | "highestBid" | "startPrice">): bigint =>
  a.bidCount ? a.highestBid : a.startPrice;

export function auctionPhase(a: Pick<AuctionLike, "status" | "endTs">, nowSec: number): AuctionPhase {
  if (a.status !== "LIVE") return a.status;
  return nowSec >= a.endTs ? "ENDED" : "LIVE";
}

/** Anti-sniping. A bid in the last five minutes extends the end time BY five minutes. */
export function endAfterBid(endTs: number, nowSec: number): { endTs: number; extended: boolean } {
  const remaining = endTs - nowSec;
  if (remaining > 0 && remaining <= AUCTION_RULES.antiSnipeSecs) {
    return { endTs: endTs + AUCTION_RULES.antiSnipeSecs, extended: true };
  }
  return { endTs, extended: false };
}

export type BidCheck = { ok: true; minNext: bigint } | { ok: false; code: BidErrorCode; message: string; minNext: bigint };
export type BidErrorCode = "NOT_LIVE" | "OWN_AUCTION" | "ALREADY_HIGHEST" | "TOO_LOW" | "INVALID_AMOUNT";

/** Pre-flight validation shared by the form and the confirm dialog (the program re-checks everything on chain). */
export function validateBid(
  a: AuctionLike & { seller: string; highestBidder?: string | null },
  amount: bigint | null,
  nowSec: number,
  bidder?: string | null,
): BidCheck {
  const minNext = minNextBid(a);
  if (auctionPhase(a, nowSec) !== "LIVE") return { ok: false, code: "NOT_LIVE", message: "This auction is not live.", minNext };
  if (bidder && bidder === a.seller) return { ok: false, code: "OWN_AUCTION", message: "You can’t bid on your own auction.", minNext };
  if (bidder && a.highestBidder && bidder === a.highestBidder) {
    return { ok: false, code: "ALREADY_HIGHEST", message: "You already hold the highest bid.", minNext };
  }
  if (amount === null || amount <= 0n) return { ok: false, code: "INVALID_AMOUNT", message: "Enter a bid in SOL (up to 9 decimals).", minNext };
  if (amount < minNext) {
    return { ok: false, code: "TOO_LOW", message: `Minimum bid is ${sol(minNext, { max: 9 })} SOL.`, minNext };
  }
  return { ok: true, minNext };
}

/** 1% of the winning bid, floored to a lamport. Paid by the seller, only when the sale completes. */
export const platformFee = (price: bigint, feeBps: bigint = AUCTION_RULES.feeBps) => (price * feeBps) / 10_000n;
export const sellerProceeds = (price: bigint, feeBps: bigint = AUCTION_RULES.feeBps) => price - platformFee(price, feeBps);

/** Quick-bid presets: min next bid, +10%, +25% (rounded up to 0.01 SOL like the reference's chips). */
export function quickBids(minNext: bigint): bigint[] {
  const step = LAMPORTS_PER_SOL / 100n;
  const up = (v: bigint) => ((v + step - 1n) / step) * step;
  return [minNext, up((minNext * 110n) / 100n), up((minNext * 125n) / 100n)].filter((v, i, arr) => arr.indexOf(v) === i);
}

export const DURATIONS = [
  { key: "10m", secs: 600 },
  { key: "15m", secs: 900 },
  { key: "30m", secs: 1_800 },
  { key: "1h", secs: 3_600 },
  { key: "6h", secs: 21_600 },
  { key: "12h", secs: 43_200 },
  { key: "24h", secs: 86_400 },
  { key: "3d", secs: 259_200 },
  { key: "7d", secs: 604_800 },
] as const;
export type DurationKey = (typeof DURATIONS)[number]["key"];
export const durationSecs = (k: DurationKey) => DURATIONS.find((d) => d.key === k)!.secs;
