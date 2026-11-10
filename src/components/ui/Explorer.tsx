"use client";
import { useState } from "react";
import { config } from "@/lib/config";
import { short } from "@/lib/format";
import { CheckIcon, CopyIcon, ExternalIcon } from "./Icons";

const solscanCluster = config.cluster === "mainnet-beta" ? "" : `?cluster=${config.cluster}`;
/** Solscan for public clusters; the Solana Explorer pointed at the local RPC for a local validator. */
export const explorerUrl = (kind: "tx" | "account" | "token", id: string) =>
  config.cluster === "localnet"
    ? `https://explorer.solana.com/${kind === "tx" ? "tx" : "address"}/${id}?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`
    : `https://solscan.io/${kind}/${id}${solscanCluster}`;
export const pumpUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

/**
 * An address, shortened, linked to the block explorer.
 */
export function AddressLink({ value, kind = "account", chars = 4, className = "" }: { value?: string | null; kind?: "account" | "token"; chars?: number; className?: string }) {
  if (!value) return <span>—</span>;
  // `normal-case`: base58 is case-sensitive, and addresses often sit inside uppercase pills/eyebrows. Never alter their casing.
  return (
    <a className={`link mono normal-case ${className}`} href={explorerUrl(kind, value)} target="_blank" rel="noopener noreferrer" title={value}>
      {short(value, chars)}
    </a>
  );
}

/** Transaction signature, linked to the block explorer. */
export function TxRef({ value }: { value?: string | null }) {
  if (!value) return <span>—</span>;
  return (
    <a className="link mono normal-case inline-flex items-center gap-1" href={explorerUrl("tx", value)} target="_blank" rel="noopener noreferrer">
      {short(value, 4)} <ExternalIcon size={12} />
    </a>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-xs font-semibold hover:border-ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          window.prompt("Copy:", value);
        }
      }}
    >
      {done ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
      {done ? "Copied" : label}
    </button>
  );
}

/** Full mint address with copy + explorer link — shown on token pages so users can compare against look-alikes. */
export function MintLine({ mint }: { mint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
      <span className="mono min-w-0 flex-1 break-all text-xs">{mint}</span>
      <CopyButton value={mint} />
      <a className="link inline-flex items-center gap-1 text-xs" href={explorerUrl("token", mint)} target="_blank" rel="noopener noreferrer">
        Explorer <ExternalIcon size={12} />
      </a>
    </div>
  );
}
