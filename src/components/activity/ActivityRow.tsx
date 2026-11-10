"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { TxRef } from "@/components/ui/Explorer";
import { useNow } from "@/hooks/useNow";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import { age } from "@/lib/time";
import type { ActivityEvent } from "@/types";

const sym = (e: ActivityEvent) => <b className="font-semibold">${e.symbol ?? "?"}</b>;

/** One sentence per event kind. Returns the text and where clicking should go. */
export function describe(e: ActivityEvent): { text: ReactNode; href: string; tone?: "good" | "warn" | "muted" } {
  const amt = e.amount !== undefined ? `${sol(e.amount, { max: 9 })} SOL` : "";
  switch (e.kind) {
    case "BID_PLACED":
      return { text: <>bid <b>{amt}</b> on {sym(e)}</>, href: `/auctions/${e.auction}` };
    case "AUCTION_SETTLED":
      return { text: <>{sym(e)} sold for <b>{amt}</b></>, href: `/auctions/${e.auction}`, tone: "warn" };
    case "AUCTION_CREATED":
      return { text: <>{sym(e)} listed for auction · from <b>{amt}</b></>, href: `/auctions/${e.auction}`, tone: "good" };
    case "AUCTION_CANCELLED":
      return { text: <>{sym(e)} auction cancelled</>, href: `/auctions/${e.auction}`, tone: "muted" };
    case "AUCTION_UNSOLD":
      return { text: <>{sym(e)} ended without bids</>, href: `/auctions/${e.auction}`, tone: "muted" };
    case "DEED_TRANSFERRED":
      return { text: <>Deed of {sym(e)} transferred to <b className="mono">{short(e.counterparty)}</b></>, href: `/auctions/${e.auction}` };
    case "FEES_CLAIMED":
      return { text: <>claimed <b>{amt}</b> creator fees on {sym(e)}</>, href: `/coins?q=${encodeURIComponent(e.symbol ?? "")}` };
    case "COIN_LAUNCHED":
      return { text: <>{sym(e)} launched · Deed minted</>, href: `/coins?q=${encodeURIComponent(e.symbol ?? "")}` };
    case "OTC_OFFER_CREATED":
      return { text: <>OTC: new offer on {sym(e)} · <b>{amt}</b></>, href: `/otc/offer/${e.offer}` };
    case "OTC_OFFER_FILLED":
      return { text: <>OTC: {sym(e)} traded for <b>{amt}</b></>, href: `/otc/offer/${e.offer}`, tone: "good" };
  }
}

export function ActivityRow({ e, showRef = false }: { e: ActivityEvent; showRef?: boolean }) {
  const now = useNow();
  const d = describe(e);
  const tone = d.tone === "good" ? "text-live" : d.tone === "muted" ? "text-muted" : "";
  return (
    <div className={`grid items-center gap-2 border-b border-dashed border-stone px-4 py-2 text-[13px] last:border-0 hover:bg-paper ${showRef ? "grid-cols-[36px_28px_92px_minmax(0,1fr)] md:grid-cols-[36px_28px_92px_minmax(0,1fr)_150px]" : "grid-cols-[34px_28px_84px_minmax(0,1fr)]"}`}>
      <span className="mono text-muted">{now ? age(e.ts, now) : ""}</span>
      <Avatar coin={{ symbol: e.symbol, image: e.image }} size="xs" square />
      <span className="mono truncate text-xs text-muted" title={e.actor ?? ""}>{e.actor ? short(e.actor) : ""}</span>
      <Link href={d.href} className={`truncate no-underline hover:underline ${tone}`}>{d.text}</Link>
      {showRef && (
        <span className="col-span-4 col-start-1 -mt-0.5 pl-[36px] text-xs md:col-span-1 md:col-start-auto md:mt-0 md:pl-0 md:text-right">
          <TxRef value={e.ref} />
        </span>
      )}
    </div>
  );
}
