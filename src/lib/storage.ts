/**
 * Safe localStorage wrapper. Storage can throw (private mode, blocked cookies, quota) — the app must still render.
 * bigint values are encoded as `{"$bigint":"123"}` so money persists exactly.
 */
const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? { $bigint: v.toString() } : v);
const reviver = (_k: string, v: unknown) => {
  if (v && typeof v === "object" && "$bigint" in (v as Record<string, unknown>)) {
    try {
      return BigInt((v as { $bigint: string }).$bigint);
    } catch {
      return 0n;
    }
  }
  return v;
};

export const stringify = (v: unknown) => JSON.stringify(v, replacer);
export const parse = <T>(s: string): T => JSON.parse(s, reviver) as T;

export function lsGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function lsRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
export function lsGetJson<T>(key: string, fallback: T): T {
  const raw = lsGet(key);
  if (!raw) return fallback;
  try {
    return parse<T>(raw);
  } catch {
    return fallback;
  }
}
export const lsSetJson = (key: string, value: unknown) => lsSet(key, stringify(value));
