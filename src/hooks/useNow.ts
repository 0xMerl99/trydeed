"use client";
import { useSyncExternalStore } from "react";

/**
 * One shared 1-second clock for every countdown on the page.
 *
 * It is the CLUSTER clock, not the browser clock: `setClockOffset` is fed by `ClockSync` (components/layout) which
 * measures `clusterTime - Date.now()`. A user with a wrong system clock therefore sees the same countdown as everyone else.
 */
let offsetSec = 0;
let tickSec = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const compute = () => Math.floor(Date.now() / 1000 + offsetSec);

function start() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(() => {
    const next = compute();
    if (next !== tickSec) {
      tickSec = next;
      listeners.forEach((l) => l());
    }
  }, 250);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function setClockOffset(secs: number) {
  offsetSec = Number.isFinite(secs) ? secs : 0;
  tickSec = compute();
  listeners.forEach((l) => l());
}
export const getClockOffset = () => offsetSec;

/** Cluster-adjusted unix seconds. `0` during SSR/hydration — render a neutral placeholder when `now === 0`. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => tickSec, () => 0);
}

/** Non-reactive read for event handlers. */
export const nowNow = () => compute();
