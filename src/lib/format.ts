/** Small formatting + identity helpers shared across the UI. */

export const short = (a?: string | null, n = 4) => (a ? `${a.slice(0, n)}…${a.slice(-n)}` : "—");

/** Base58, 32–44 chars: a syntactic check only. Use `isValidPublicKey` (lib/solana) when a real key is required. */
export const looksLikeAddress = (s?: string | null) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s ?? "").trim());

export function usd(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

/** Stable hue 0–359 from a string — avatar fallback colours. */
export function hueOf(s: string): number {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Pluralise: plural(1,"bid") -> "1 bid". */
export const plural = (n: number, w: string, p = w + "s") => `${n} ${n === 1 ? w : p}`;

export const ticker = (s: string) => s.replace(/^\$/, "").toUpperCase();
