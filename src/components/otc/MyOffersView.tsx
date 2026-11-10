"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { OfferBadge } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/States";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { TxRef } from "@/components/ui/Explorer";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { useAsync } from "@/hooks/useAsync";
import { useNotifications } from "@/hooks/useNotifications";
import { useNow } from "@/hooks/useNow";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import { until, when } from "@/lib/time";
import { getService } from "@/services";
import type { OfferState, OtcOffer } from "@/types";
import Link from "next/link";
import { NotificationsCard } from "./Notifications";
import { Side, TokenLabel, stl, tamt } from "./shared";
import { useCloseOffer } from "./useCloseOffer";

type Tab = "made" | "received" | "trades" | "notes";
type Filter = "all" | "active" | "accepted" | "rejected" | "expired" | "cancelled";
const FILTERS: [Filter, string, (s: OfferState) => boolean][] = [
  ["all", "All", () => true],
  ["active", "Active", (s) => s === "ACTIVE" || s === "PARTIALLY_FILLED"],
  ["accepted", "Accepted", (s) => s === "FILLED" || s === "PARTIALLY_FILLED"],
  ["rejected", "Rejected", (s) => s === "REJECTED"],
  ["expired", "Expired", (s) => s === "EXPIRED"],
  ["cancelled", "Cancelled", (s) => s === "CANCELLED"],
];

export function MyOffersView() {
  return <ConnectGate eyebrow="My Offers">{(address) => <Body address={address} />}</ConnectGate>;
}

function Body({ address }: { address: string }) {
  const sp = useSearchParams();
  const now = useNow();
  const { unread, markAllRead } = useNotifications();
  const [tab, setTab] = useState<Tab>(sp.get("tab") === "notes" ? "notes" : "made");
  const [filter, setFilter] = useState<Filter>("all");
  const { data: m, error, loading, reload } = useAsync(() => getService().getOtcMine(address), [address], { refreshMs: 20_000 });
  const { ask, dialog, busy } = useCloseOffer(reload);
  const toast = useToast();

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !m) return <div className="wrap pt-10"><ErrorState error={error ?? new Error("Couldn’t load your offers")} onRetry={reload} /></div>;

  const isOpen = (o: OtcOffer) => o.live && (o.state === "ACTIVE" || o.state === "PARTIALLY_FILLED") && (!now || o.expiresAt > now);
  const live = m.made.filter((o) => o.live);
  const recvOpen = m.received.filter(isOpen);
  const escrowSol = live.filter((o) => o.kind === "BUY").reduce((s, o) => s + o.priceRemaining, 0n);
  const stale = live.some((o) => o.state === "EXPIRED" || o.state === "FILLED");
  const pick = FILTERS.find(([k]) => k === filter)![2];

  const tabs: TabDef<Tab>[] = [
    { key: "made", label: "Sent", count: m.made.length },
    { key: "received", label: "Received", count: recvOpen.length },
    { key: "trades", label: "Trades", count: m.trades.length },
    { key: "notes", label: "Notifications", count: unread },
  ];

  const table = (list: OtcOffer[], kind: "made" | "received") => {
    const l = list.filter((o) => pick(o.state));
    if (!list.length) return <EmptyState>{kind === "made" ? <>You haven’t sent any OTC offers yet. Open a token in <Link className="link" href="/otc">OTC Markets</Link> to make one.</> : "Nobody has sent you a private offer yet."}</EmptyState>;
    return (
      <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        {l.length ? (
          <div className="tbl-wrap"><table className="tbl" data-testid={`offers-${kind}`}>
            <thead><tr><th>Token</th><th>Side</th><th>Amount</th><th>Price</th><th>Status</th><th>Expires</th><th>{kind === "made" ? "To" : "From"}</th><th /></tr></thead>
            <tbody>{l.map((o) => {
              const open = isOpen(o);
              return (
                <tr key={o.address}>
                  <td><TokenLabel t={o.token} mint={o.mint} /></td>
                  <td><Side kind={o.kind} />{o.parent && <span className="block text-xs text-muted">counter</span>}</td>
                  <td className="num">{tamt(o.remaining, o.token)}<span className="block text-xs text-muted">of {tamt(o.amountTotal, o.token)}</span></td>
                  <td className="num">{stl(o.priceTotal)}</td>
                  <td><OfferBadge state={o.state} /></td>
                  <td className="text-muted">{o.live && now ? until(o.expiresAt, now) : "—"}</td>
                  <td>{kind === "made" ? (o.counterparty ? short(o.counterparty) : "public") : short(o.maker)}</td>
                  <td className="right whitespace-nowrap">
                    {kind === "received" && open ? (
                      <><Button size="sm" variant="gold" href={`/otc/offer/${o.address}`}>Review</Button>{" "}<Button size="sm" disabled={busy} onClick={() => ask(o, "reject")}>Reject</Button></>
                    ) : (
                      <><Button size="sm" href={`/otc/offer/${o.address}`}>View</Button>{kind === "made" && o.live && <>{" "}<Button size="sm" disabled={busy} onClick={() => ask(o, open ? "cancel" : "done")}>{open ? "Cancel" : "Close"}</Button></>}</>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <EmptyState>No {FILTERS.find(([k]) => k === filter)![1].toLowerCase()} offers.</EmptyState>}
      </>
    );
  };

  return (
    <div className="wrap">
      <PageTitle eyebrow={<>My Offers · <span className="normal-case">{short(address)}</span></>} lead="Your" hl="OTC desk" />
      <div className="my-6 grid grid-cols-2 gap-4 w981:grid-cols-4" data-testid="offers-summary">
        <Tile label="Open offers" value={String(live.filter((o) => isOpen(o)).length)} sub={`${live.length} accounts still open`} />
        <Tile label="SOL locked in bids" value={sol(escrowSol, { max: 9 })} sub="refundable by cancelling" />
        <Tile label="Offers to you" value={String(recvOpen.length)} sub="private, waiting for you" />
        <Tile label="Trades" value={String(m.trades.length)} sub="settled" />
      </div>
      {stale && <div className="notice mb-4">Some of your offers expired or filled but are still open. <b>Close</b> them to get the remaining assets and the account rent back.</div>}

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(t) => { setTab(t); if (t === "notes") setTimeout(markAllRead, 1500); }}
        label="My offers sections"
        aside={<Link href={`/otc/wallet/${address}`} className="hidden whitespace-nowrap pb-2 text-sm font-semibold no-underline hover:underline w640:block">My wallet tokens →</Link>}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "made" && table(m.made, "made")}
        {tab === "received" && table(m.received, "received")}
        {tab === "trades" && (m.trades.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Token</th><th>You</th><th>Amount</th><th>SOL</th><th>Fee</th><th>Ref</th></tr></thead>
            <tbody>{m.trades.map((f) => {
              const youMaker = f.maker === address;
              const youBought = (f.kind === "SELL") !== youMaker;
              return (
                <tr key={f.ref + f.offer}>
                  <td className="text-muted">{when(f.ts)}</td>
                  <td><Link className="link mono" href={`/otc/token/${f.mint}`}>{f.token.symbol ? `$${f.token.symbol}` : short(f.mint)}</Link></td>
                  <td>{youBought ? <b className="text-live">Bought</b> : <b className="text-danger">Sold</b>} <span className="text-xs text-muted">{youMaker ? "maker" : "taker"}</span></td>
                  <td className="num">{tamt(f.amount, f.token)}</td>
                  <td className="num">{stl(f.lamports)}</td>
                  <td className="num">{youBought ? "—" : stl(f.fee)}</td>
                  <td><TxRef value={f.ref} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <EmptyState>No OTC trades yet.</EmptyState>)}
        {tab === "notes" && <NotificationsCard />}
      </div>
      {dialog}
    </div>
  );
}

const Tile = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <div className="panel !p-4">
    <span className="mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-ink">{label}</span>
    <b className="mono mt-2 block text-2xl font-semibold">{value}</b>
    <span className="mono text-xs text-muted">{sub}</span>
  </div>
);
