"use client";
import type { ReactNode } from "react";
import { useData } from "@/components/providers/DataProvider";
import { CoinIcon, GavelIcon, RocketIcon, TrendUpIcon } from "@/components/ui/Icons";
import { useNow } from "@/hooks/useNow";
import { sol } from "@/lib/sol";
import { currentBid } from "@/lib/auction";
import { countdownShort } from "@/lib/time";

/** The event marquee under the header. Decorative duplicate of the Activity feed, so it is hidden from assistive tech. */
export function Ticker() {
  const { activity, auctions, coins } = useData();
  const now = useNow();

  const items: { key: string; node: ReactNode }[] = [];
  const sym = (s?: string) => <b className="font-semibold text-ink">${s}</b>;
  for (const e of activity.slice(0, 12)) {
    if (e.kind === "BID_PLACED") items.push({ key: e.id, node: <><TrendUpIcon size={14} className="text-[#4ade80]" />{sym(e.symbol)} new bid <u className="text-gold no-underline">{sol(e.amount)} SOL</u></> });
    else if (e.kind === "AUCTION_SETTLED") items.push({ key: e.id, node: <><CoinIcon size={14} className="text-gold" />{sym(e.symbol)} <i className="not-italic text-[#fbbf77]">SOLD</i> for <u className="text-gold no-underline">{sol(e.amount)} SOL</u></> });
    else if (e.kind === "AUCTION_CREATED") items.push({ key: e.id, node: <><GavelIcon size={14} className="text-gold" />{sym(e.symbol)} new auction</> });
    else if (e.kind === "COIN_LAUNCHED") items.push({ key: e.id, node: <><RocketIcon size={14} className="text-gold" />{sym(e.symbol)} launched</> });
    else if (e.kind === "OTC_OFFER_FILLED") items.push({ key: e.id, node: <><TrendUpIcon size={14} className="text-[#4ade80]" />OTC {sym(e.symbol)} traded for <u className="text-gold no-underline">{sol(e.amount)} SOL</u></> });
  }
  if (now > 0) {
    for (const a of auctions.filter((x) => x.status === "LIVE" && x.endTs > now).sort((x, y) => x.endTs - y.endTs).slice(0, 4)) {
      items.push({ key: `end-${a.address}`, node: <><ClockGlyph />{sym(a.coin.symbol)} {a.bidCount} bids · {countdownShort(a.endTs, now)} left</> });
    }
  }
  if (!items.length) {
    items.push({ key: "a", node: <>Launch a coin. Receive the Deed. <b className="text-ink">Auction the rights.</b></> }, { key: "b", node: <>Every bid is escrowed. Outbid SOL is <b className="text-ink">immediately refundable.</b></> });
  }
  const total = coins.reduce((t, c) => t + c.fees.lifetime, 0n);

  return (
    <div className="ticker on-dark relative flex overflow-hidden border-b border-ink-3 bg-deep font-mono text-xs text-soft" aria-hidden="true">
      <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
        <div className="ticker-track">
          {[0, 1].map((dup) =>
            items.map((it) => (
              <span key={`${dup}-${it.key}`} className="inline-flex items-center gap-1.5">
                {it.node}
              </span>
            )),
          )}
        </div>
      </div>
      <div className="absolute inset-y-0 right-0 z-[2] hidden items-center gap-2 border-l border-ink-3 bg-deep px-4 text-ink w900:flex">
        <i className="h-2 w-2 rounded-full bg-gold" />
        Total creator fees: <b className="font-semibold text-gold">{sol(total)} SOL</b>
      </div>
    </div>
  );
}

const ClockGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-gold" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
