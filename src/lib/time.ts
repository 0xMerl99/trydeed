/** Time helpers. Everything is unix SECONDS; callers pass `now` so tests (and the cluster clock) stay deterministic. */

const p2 = (n: number) => String(n).padStart(2, "0");

/** "05:41:34" under a day, "2d 05h 41m" over. "Ended" at or past zero. */
export function countdown(endTs: number, nowSec: number): string {
  const s = Math.floor(endTs - nowSec);
  if (s <= 0) return "Ended";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return d > 0 ? `${d}d ${p2(h)}h ${p2(m)}m` : `${p2(h)}:${p2(m)}:${p2(x)}`;
}

/** "5h 41m" / "12m 05s" — the compact form used on cards. */
export function countdownShort(endTs: number, nowSec: number): string {
  const s = Math.max(0, Math.floor(endTs - nowSec));
  if (!s) return "Ended";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${p2(s % 60)}s`;
}

/** [hours, minutes, seconds] zero-padded, capped at 99h, for the big countdown boxes. */
export function countdownParts(endTs: number, nowSec: number): [string, string, string] {
  const s = Math.max(0, Math.floor(endTs - nowSec));
  return [Math.min(99, Math.floor(s / 3600)), Math.floor((s % 3600) / 60), s % 60].map((n) => p2(n)) as [string, string, string];
}

/** "14m", "3h", "2d" — activity feed. */
export function age(ts: number, nowSec: number): string {
  const s = Math.max(0, nowSec - ts);
  return s < 60 ? "now" : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

export const ago = (ts: number, nowSec: number) => {
  const a = age(ts, nowSec);
  return a === "now" ? "just now" : `${a} ago`;
};

/** "in 3h" / "expired" */
export function until(ts: number, nowSec: number): string {
  const s = ts - nowSec;
  if (s <= 0) return "expired";
  return s < 3600 ? `in ${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `in ${Math.round(s / 3600)}h` : `in ${Math.round(s / 86400)}d`;
}

export function when(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const nowSeconds = () => Date.now() / 1000;
