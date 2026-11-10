/**
 * SOL / lamport arithmetic. All money is `bigint` lamports — never floats.
 * 1 SOL = 1_000_000_000 lamports (9 decimals).
 */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const SOL_DECIMALS = 9;

/** Strictly parses a user-typed decimal SOL amount ("1", "0.105", "12.000000001") into lamports. */
export function parseSol(input: string): bigint | null {
  const t = String(input ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null; // no sign, no exponent, no bare "."
  const [whole, frac = ""] = t.split(".");
  if (frac.length > SOL_DECIMALS) return null; // more precision than a lamport
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt((frac + "000000000").slice(0, SOL_DECIMALS));
}

/** Exact decimal string for an `<input>` value: 1500000000n -> "1.5". No grouping, no rounding. */
export function toInputSol(lamports: bigint): string {
  const neg = lamports < 0n;
  const n = neg ? -lamports : lamports;
  const whole = n / LAMPORTS_PER_SOL;
  const frac = (n % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/**
 * Display formatting: grouped thousands, at least `min` decimals, at most `max`, trailing zeros trimmed down to `min`.
 * Rounds half-up at `max`. Use max = 9 for amounts a user must match exactly (bids).
 */
export function formatSol(lamports: bigint, opts: { min?: number; max?: number } = {}): string {
  const min = opts.min ?? 2;
  const max = opts.max ?? 4;
  const neg = lamports < 0n;
  let n = neg ? -lamports : lamports;
  const drop = SOL_DECIMALS - max;
  if (drop > 0) {
    const scale = 10n ** BigInt(drop);
    n = ((n + scale / 2n) / scale) * scale;
  }
  const whole = n / LAMPORTS_PER_SOL;
  let frac = (n % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, "0").slice(0, max);
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1);
  frac = frac.padEnd(min, "0");
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}

/** "0.03 SOL" — shows more precision for tiny non-zero values so they never read as 0.00. */
export function sol(lamports: bigint | number | null | undefined, opts?: { min?: number; max?: number }): string {
  const v = BigInt(lamports ?? 0);
  const tiny = v !== 0n && v < 10_000_000n && v > -10_000_000n;
  return formatSol(v, { max: tiny ? 6 : 4, ...opts });
}

export const solLabel = (l: bigint | number | null | undefined) => `${sol(l)} SOL`;

/** Lamports -> JS number of SOL. DISPLAY / charting only; never feed back into arithmetic. */
export const lamportsToNumber = (l: bigint) => Number(l) / 1e9;

/** Rounds `v` up to the next multiple of `step`. */
export const ceilTo = (v: bigint, step: bigint) => ((v + step - 1n) / step) * step;

/** SOL amount for display, or an em dash when the chain cannot tell us (e.g. 24 h fees need a history indexer). */
export const solOrDash = (l: bigint | null | undefined, opts?: { min?: number; max?: number }) => (l == null ? "—" : `${sol(l, opts)} SOL`);
/** Market cap (lamports from Pump's bonding-curve reserves) for display. */
export const mcap = (l: bigint | null | undefined) => (l == null ? "—" : `${sol(l, { max: 2 })} SOL`);
