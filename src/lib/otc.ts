/**
 * OTC unit math. Token amounts are `bigint` base units; prices are lamports for the WHOLE offer (not per token).
 * Rounding rules mirror how an escrow program must settle partial fills: the party paying SOL never underpays
 * (round up), the party receiving SOL never over-receives (round down), and the last fill takes the exact remainder.
 */
import { LAMPORTS_PER_SOL } from "./sol";

export type OfferKind = "SELL" | "BUY";

/** "1234.5" -> base units. Returns null for malformed input or more decimals than the token has. */
export function toUnits(input: string, decimals: number): bigint | null {
  const t = String(input ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  if (f.length > decimals) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** base units -> grouped decimal string, rounded half-up to `dp` places (trailing zeros trimmed). */
export function fmtUnits(value: bigint, decimals: number, dp = Math.min(decimals, 6)): string {
  const neg = value < 0n;
  let n = neg ? -value : value;
  dp = Math.min(dp, decimals);
  const scale = 10n ** BigInt(decimals - dp);
  n = (n + scale / 2n) / scale;
  const whole = n / 10n ** BigInt(dp);
  const frac = (n % 10n ** BigInt(dp)).toString().padStart(dp, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}

/** Exact decimal string of base units for an input (no grouping). */
export function unitsToInput(value: bigint, decimals: number): string {
  const w = value / 10n ** BigInt(decimals);
  const f = (value % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

/** Total lamports for `amount` base units at a price of `pricePerToken` (decimal string, SOL per whole token). */
export function totalFromUnitPrice(amount: bigint, pricePerToken: string, decimals: number): bigint | null {
  const p = toUnits(pricePerToken, 18); // 18 dp of SOL per whole token is plenty
  if (p === null) return null;
  return (amount * p) / 10n ** BigInt(decimals + 9);
}

/** SOL per whole token for display / two-way input sync. Float is fine here: it is never used to settle. */
export function unitPriceNumber(totalLamports: bigint, amount: bigint, decimals: number): number | null {
  const a = Number(amount) / 10 ** decimals;
  if (!a) return null;
  return Number(totalLamports) / 1e9 / a;
}

export function fmtUnitPrice(totalLamports: bigint, amount: bigint, decimals: number): string {
  const v = unitPriceNumber(totalLamports, amount, decimals);
  if (v === null) return "—";
  return v >= 1
    ? v.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : v.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

/**
 * Lamports owed for filling `amount` of an offer that still has `remaining` tokens for `priceRemaining` lamports.
 * SELL offer (taker buys): round UP. BUY bid (taker sells): round DOWN. Filling everything returns the exact remainder.
 */
export function fillLamports(kind: OfferKind, amount: bigint, remaining: bigint, priceRemaining: bigint): bigint {
  if (amount === remaining) return priceRemaining;
  return kind === "SELL" ? (amount * priceRemaining + remaining - 1n) / remaining : (amount * priceRemaining) / remaining;
}

/** Trading fee on the SOL leg, in bps, floored. Paid by the token seller. */
export const otcFee = (lamports: bigint, feeBps: number) => (lamports * BigInt(feeBps)) / 10_000n;

export const isLamportsPositive = (v: bigint | null): v is bigint => v !== null && v > 0n;
export const LAMPORTS = LAMPORTS_PER_SOL;
