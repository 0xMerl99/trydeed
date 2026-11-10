"use client";
import { useState } from "react";
import { CardLink } from "@/components/auctions/cards";
import { Avatar } from "@/components/ui/Avatar";
import { FavButton } from "@/components/ui/FavButton";
import { Pill } from "@/components/ui/Pill";
import { useNow } from "@/hooks/useNow";
import { mcap, sol } from "@/lib/sol";
import { ago } from "@/lib/time";
import type { Coin } from "@/types";
import { CoinDetailsModal } from "./CoinDetails";

/**
 * Coin card: image, ticker, name, launch age, market cap, creator fees, Deed status.
 * On auction → opens the auction. Otherwise → a details dialog with the token address, creator and Deed ownership.
 */
export function CoinCard({ c }: { c: Coin }) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const status =
    c.status === "ON_AUCTION" ? <Pill tone="live">On auction</Pill> : c.status === "SOLD" ? <Pill>Sold {c.sales}x</Pill> : <Pill>Held by owner</Pill>;
  return (
    <>
      <CardLink
        href={c.liveAuction ? `/auctions/${c.liveAuction}` : undefined}
        onActivate={c.liveAuction ? undefined : () => setOpen(true)}
        label={c.liveAuction ? `Open the $${c.symbol} auction` : `Details for $${c.symbol} ${c.name}`}
        className="flex flex-col gap-3 p-3.5"
      >
        <div className="flex items-start gap-3">
          <Avatar coin={c} size="sq" />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="display truncate text-xl font-semibold leading-tight">${c.symbol}</b>
            <span className="truncate text-[13px] font-medium text-muted">{c.name}</span>
            <small className="text-xs text-muted">Launched {now ? ago(c.launchedAt, now) : ""}</small>
          </div>
          <FavButton id={c.mint} />
        </div>
        <div className="flex items-end gap-4">
          <div>
            <b className="mono block whitespace-nowrap text-[15px] font-semibold">{mcap(c.market.marketCapSol)}</b>
            <span className="text-xs font-medium text-muted">Market cap</span>
          </div>
          <div>
            <b className="mono block whitespace-nowrap text-[15px] font-semibold">{sol(c.fees.lifetime)} SOL</b>
            <span className="text-xs font-medium text-muted">Creator fees</span>
          </div>
          <span className="ml-auto">{status}</span>
        </div>
      </CardLink>
      {open && <CoinDetailsModal coin={c} onClose={() => setOpen(false)} />}
    </>
  );
}
