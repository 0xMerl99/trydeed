"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { useDeedWallet } from "./DeedWallet";

/** Pages that need a wallet render this until one is connected (same pattern as the reference: title + prompt). */
export function ConnectGate({ eyebrow, children }: { eyebrow: string; children: (address: string) => ReactNode }) {
  const w = useDeedWallet();
  if (w.address) return <>{children(w.address)}</>;
  return (
    <div className="wrap">
      <PageTitle eyebrow={eyebrow} lead="Connect your" hl="wallet" />
      <div className="empty mt-8" data-testid="connect-prompt">
        <p className="mx-auto mb-4 max-w-md">Connect a wallet to see your Deeds, auctions, bids, refunds, offers and claimable creator fees.</p>
        <Button variant="gold" onClick={w.openPicker}>
          Connect Wallet
        </Button>
      </div>
    </div>
  );
}
