"use client";
import { useCallback, useSyncExternalStore } from "react";
import { lsGetJson, lsSetJson } from "@/lib/storage";

const KEY = "deed.watchlist";
let cache: Set<string> | null = null;
const listeners = new Set<() => void>();
let version = 0;

const read = () => (cache ??= new Set(lsGetJson<string[]>(KEY, [])));

function write(next: Set<string>) {
  cache = next;
  lsSetJson(KEY, [...next]);
  version++;
  listeners.forEach((l) => l());
}

/** Per-browser watchlist (hearts on cards). Stored locally only — it is a convenience, not account data. */
export function useWatchlist() {
  useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => version, () => 0);
  const set = read();
  const has = useCallback((k: string) => read().has(k), []);
  const toggle = useCallback((k: string) => {
    const n = new Set(read());
    const on = !n.has(k);
    if (on) n.add(k);
    else n.delete(k);
    write(n);
    return on;
  }, []);
  return { has, toggle, count: set.size };
}
