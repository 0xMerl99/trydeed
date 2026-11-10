"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getService } from "@/services";
import type { ActivityEvent, Auction, Coin, PlatformStatus } from "@/types";

interface DataCtx {
  status?: PlatformStatus;
  auctions: Auction[];
  coins: Coin[];
  activity: ActivityEvent[];
  loaded: boolean;
  /** First failure of the last refresh (e.g. integration not configured). `status` may still be present. */
  error?: Error;
  refresh: () => Promise<void>;
}
const Ctx = createContext<DataCtx | null>(null);

export const useData = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData must be used inside <DataProvider>");
  return c;
};

/** Platform-wide data (status, auctions, coins, activity), loaded once and refreshed every 20 s like the reference. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<DataCtx, "refresh">>({ auctions: [], coins: [], activity: [], loaded: false });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const svc = getService();
    const [st, au, co, ac] = await Promise.allSettled([svc.getStatus(), svc.listAuctions(), svc.listCoins(), svc.listActivity()]);
    if (!alive.current) return;
    const failed = [st, au, co, ac].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    setS({
      status: st.status === "fulfilled" ? st.value : undefined,
      auctions: au.status === "fulfilled" ? au.value : [],
      coins: co.status === "fulfilled" ? co.value : [],
      activity: ac.status === "fulfilled" ? ac.value : [],
      loaded: true,
      error: failed ? (failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason))) : undefined,
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...s, refresh }), [s, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
