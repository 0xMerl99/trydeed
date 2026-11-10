"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { FavButton } from "@/components/ui/FavButton";
import { Pill } from "@/components/ui/Pill";
import { useNow } from "@/hooks/useNow";
import { auctionPhase, currentBid } from "@/lib/auction";
import { mcap, sol, solOrDash } from "@/lib/sol";
import { ago } from "@/lib/time";
import type { Auction } from "@/types";

/**
 * A card with ONE primary action, done accessibly: the card is a plain <article>; an empty overlay link/button
 * (the "stretched link") covers it and carries the accessible name. Secondary controls (e.g. the watch heart) sit above
 * it with `relative z-10`, so nothing interactive is ever nested inside anything else.
 */
export function CardLink({ href, onActivate, label, className = "", children }: { href?: string; onActivate?: () => void; label: string; className?: string; children: ReactNode }) {
  const overlay = "absolute inset-0 z-[1] rounded-xl";
  return (
    <article className={`group relative rounded-xl border border-line bg-surface transition hover:border-ink ${className}`}>
      {children}
      {onActivate ? <button type="button" className={overlay} aria-label={label} onClick={onActivate} /> : <Link href={href!} className={overlay} aria-label={label} />}
    </article>
  );
}

const Label = ({ children }: { children: ReactNode }) => <span className="text-xs font-medium text-muted">{children}</span>;

/** The full lot card used on Live Auctions and in Portfolio. */
export function LotCard({ a }: { a: Auction }) {
  const now = useNow();
  const phase = now ? auctionPhase(a, now) : "LIVE";
  const hot = phase === "LIVE" && a.endTs - now < 600;
  const c = a.coin;
  return (
    <article className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-[18px] transition hover:border-ink" data-testid="lot-card">
      <div className="flex items-center justify-between">
        <span className="eyebrow">${c.symbol}</span>
        {phase === "ENDED" ? <Pill tone="hot">Ended · settle</Pill> : hot ? <Pill tone="hot">Ending</Pill> : <Pill tone="live">Live</Pill>}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar coin={c} size="md" />
        <div className="min-w-0">
          <h2 className="display m-0 truncate text-[22px] font-semibold leading-tight tracking-tight">{c.name}</h2>
          <span className="mono text-xs text-muted">
            ${c.symbol} · MC {mcap(c.market.marketCapSol)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-stone bg-paper p-2.5">
        <div className="kv"><span className="!text-[10px]">Lifetime fees</span><b className="!text-sm">{sol(c.fees.lifetime)}</b></div>
        <div className="kv"><span className="!text-[10px]">24h fees</span><b className="!text-sm">{solOrDash(c.fees.d24)}</b></div>
        <div className="kv"><span className="!text-[10px]">Bids</span><b className="!text-sm">{a.bidCount}</b></div>
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <div>
          <Label>{a.bidCount ? "Current bid" : "Starting bid"}</Label>
          <div className="mono text-[26px] font-semibold leading-none">
            {sol(currentBid(a), { max: 9 })} <small className="text-xs font-medium text-muted">SOL</small>
          </div>
        </div>
        <div className="text-right">
          <Label>Time left</Label>
          <div className="text-base font-semibold"><Countdown end={a.endTs} /></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" href={`/auctions/${a.address}`}>View Auction</Button>
        <Button size="sm" variant="gold" href={`/auctions/${a.address}${phase === "ENDED" ? "" : "?focus=bid"}`}>
          {phase === "ENDED" ? "Settle" : "Place Bid"}
        </Button>
      </div>
    </article>
  );
}

/** Compact card for sold / cancelled / unsold lots. */
export function ClosedLotCard({ a }: { a: Auction }) {
  const now = useNow();
  const sold = a.status === "SETTLED";
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-[18px]">
      <div className="flex items-center justify-between">
        <span className="eyebrow">${a.coin.symbol}</span>
        <Pill tone={sold ? "ink" : "default"}>{sold ? "Sold" : a.status === "CANCELLED" ? "Cancelled" : "No sale"}</Pill>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar coin={a.coin} size="md" />
        <div className="min-w-0">
          <h2 className="display m-0 truncate text-[22px] font-semibold leading-tight">{a.coin.name}</h2>
          <span className="mono text-xs text-muted">{sold ? `Sold for ${sol(a.highestBid, { max: 9 })} SOL` : "No sale"}{now ? ` · ${ago(a.endTs, now)}` : ""}</span>
        </div>
      </div>
      <Button size="sm" href={`/auctions/${a.address}`}>View</Button>
    </article>
  );
}

/** Home → "Ending Soon". */
export function EndingCard({ a }: { a: Auction }) {
  const c = a.coin;
  return (
    <CardLink href={`/auctions/${a.address}`} label={`Open the $${c.symbol} ${c.name} auction`} className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start gap-3">
        <Avatar coin={c} size="sq" />
        <div className="flex min-w-0 flex-1 flex-col">
          <b className="display truncate text-xl font-semibold leading-tight">${c.symbol}</b>
          <span className="truncate text-[13px] font-medium text-muted">{c.name}</span>
          <small className="text-xs text-muted">Lifetime fees {sol(c.fees.lifetime)} SOL</small>
        </div>
        <FavButton id={a.address} />
      </div>
      <div className="flex items-end gap-4">
        <div>
          <b className="mono block text-[15px] font-semibold">{sol(currentBid(a), { max: 9 })} SOL</b>
          <span className="text-xs font-medium text-muted">{a.bidCount ? "Current bid" : "Starting bid"}</span>
        </div>
        <div>
          <b className="mono block text-[15px] font-semibold">{a.bidders}</b>
          <span className="text-xs font-medium text-muted">Bidders</span>
        </div>
        <span className="ml-auto rounded-lg border border-danger px-2.5 py-1 text-[13px] font-semibold text-danger">
          <Countdown end={a.endTs} variant="short" className="!text-danger" />
        </span>
      </div>
    </CardLink>
  );
}

/** Home → "Recently Sold". */
export function SoldCard({ a }: { a: Auction }) {
  const now = useNow();
  return (
    <CardLink href={`/auctions/${a.address}`} label={`Open the sold $${a.coin.symbol} auction`} className="flex items-center gap-3 p-3.5">
      <Avatar coin={a.coin} size="md" square />
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="display truncate text-xl font-semibold leading-tight">${a.coin.symbol}</b>
        <span className="truncate text-[13px] font-medium text-muted">Sold for {sol(a.highestBid, { max: 9 })} SOL</span>
        <small className="text-xs text-muted">{now ? ago(a.endTs, now) : ""}</small>
      </div>
      <div className="flex flex-col items-end justify-between gap-2 self-stretch">
        <FavButton id={a.address} />
        <span className="mono rounded-md bg-gold px-2 py-0.5 text-[11px] font-semibold text-paper">SOLD</span>
      </div>
    </CardLink>
  );
}
