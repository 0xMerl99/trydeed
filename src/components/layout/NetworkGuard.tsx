"use client";
import { useEffect, useState } from "react";
import { clusterLabel, config } from "@/lib/config";
import { verifyCluster, type ClusterCheck } from "@/lib/solana";

/**
 * Network verification: confirms the configured RPC really is the cluster the app expects (genesis hash).
 * Shows a blocking-style banner on a MISMATCH only — an unreachable RPC is not alarming and stays silent.
 * (The wallet's own network setting can't be read through the adapter; that limit is documented in INTEGRATIONS.md.)
 */
export function NetworkGuard() {
  const [check, setCheck] = useState<ClusterCheck | null>(null);
  useEffect(() => {
    let alive = true;
    verifyCluster().then((c) => alive && setCheck(c));
    return () => {
      alive = false;
    };
  }, []);
  if (check?.status !== "mismatch") {
    // A test network is legitimate for development, but nobody should mistake it for real funds.
    return config.cluster === "mainnet-beta" ? null : (
      <div role="status" className="border-b border-gold/60 bg-gold/10 px-4 py-1.5 text-center text-xs font-semibold text-ink">
        {clusterLabel(config.cluster)}: transactions here use test funds, not real money.
      </div>
    );
  }
  return (
    <div role="alert" className="border-b-2 border-danger bg-danger/15 px-4 py-2 text-center text-sm font-semibold text-ink">
      Wrong network: the RPC endpoint is not {clusterLabel(config.cluster)}. Transactions are disabled until NEXT_PUBLIC_SOLANA_RPC_URL points at the right cluster.
    </div>
  );
}

/** Footer tag. */
export function NetworkTag() {
  const [check, setCheck] = useState<ClusterCheck | null>(null);
  useEffect(() => {
    let alive = true;
    verifyCluster().then((c) => alive && setCheck(c));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <span className="mono inline-flex items-center gap-1.5 text-[11px]" title={check?.status === "ok" ? "RPC verified against the cluster genesis hash" : "RPC not verified"}>
      <span className={`h-1.5 w-1.5 rounded-full ${check?.status === "ok" ? "bg-[#4ade80]" : check?.status === "mismatch" ? "bg-danger-soft" : "bg-soft"}`} />
      {clusterLabel(config.cluster)}
    </span>
  );
}
