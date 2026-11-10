"use client";
import { useEffect } from "react";
import { setClockOffset } from "@/hooks/useNow";
import { getService } from "@/services";

/** Keeps the shared countdown clock aligned with the cluster (live) every minute. Renders nothing. */
export function ClockSync() {
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const t0 = Date.now() / 1000;
        const cluster = await getService().getClusterTime();
        const t1 = Date.now() / 1000;
        if (alive) setClockOffset(cluster - (t0 + t1) / 2); // compensate for the round trip
      } catch {
        /* keep the previous offset; countdowns still run off the last good sync */
      }
    };
    void sync();
    const t = setInterval(sync, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return null;
}
