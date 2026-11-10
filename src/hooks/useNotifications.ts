"use client";
import { useCallback, useEffect, useState } from "react";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { lsGet, lsSet } from "@/lib/storage";
import { getService } from "@/services";
import { useAsync } from "./useAsync";

const seenKey = (a: string) => `deed.nseen.${a}`;

/** Notifications for the connected wallet + a locally-remembered "last seen" marker for the bell badge. */
export function useNotifications() {
  const { address } = useDeedWallet();
  const { data, reload } = useAsync(() => getService().getNotifications(address!), [address], { enabled: !!address, refreshMs: 45_000 });
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    setSeen(address ? Number(lsGet(seenKey(address)) || 0) : 0);
  }, [address]);

  const list = data ?? [];
  const unread = list.filter((n) => n.ts > seen).length;
  const markAllRead = useCallback(() => {
    if (!address) return;
    const now = Math.floor(Date.now() / 1000);
    lsSet(seenKey(address), String(now));
    setSeen(now);
  }, [address]);

  return { list, unread, seen, markAllRead, reload, loaded: data !== undefined };
}
