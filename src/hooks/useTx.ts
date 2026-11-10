"use client";
import { useCallback, useRef, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useToast } from "@/components/ui/Toast";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { friendlyError } from "@/lib/errors";
import { verifyCluster } from "@/lib/solana";
import type { TxContext, TxReceipt } from "@/services/types";

/**
 * The one way any page performs a write:
 *   1. make sure a wallet is connected (opens the picker, rejects if the user backs out) and the RPC is the right cluster
 *   2. run the service call with a fresh TxContext
 *   3. toast the receipt message or the program's own error message
 *   4. refresh platform data
 * Returns the receipt, or `null` if anything failed (already toasted). Re-entrancy is blocked while `busy`.
 */
export function useTx() {
  const wallet = useDeedWallet();
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const run = useCallback(
    async <R extends TxReceipt>(fn: (ctx: TxContext) => Promise<R>, opts: { silent?: boolean } = {}): Promise<R | null> => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(true);
      try {
        await wallet.connect();
        // Never send a transaction through an RPC that is not the cluster this app is configured for.
        const net = await verifyCluster();
        if (net.status === "mismatch") throw new Error("Wrong network: the RPC endpoint is not the cluster this app is configured for. Nothing was sent.");
        const ctx = wallet.txContext();
        if (!ctx) throw new Error("No wallet connected.");
        const r = await fn(ctx);
        if (!opts.silent && r.message) toast(r.message, "success");
        void refresh();
        return r;
      } catch (e) {
        toast(friendlyError(e), "error");
        return null;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [wallet, toast, refresh],
  );

  return { run, busy };
}
