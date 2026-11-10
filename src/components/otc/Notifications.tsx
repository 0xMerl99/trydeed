"use client";
import Link from "next/link";
import { Skeleton } from "@/components/ui/States";
import { useNotifications } from "@/hooks/useNotifications";
import { useNow } from "@/hooks/useNow";
import { age } from "@/lib/time";
import type { NotificationKind } from "@/types";
import { stl, tamt } from "./shared";
import { useAsync } from "@/hooks/useAsync";
import { getService } from "@/services";

const NOTE: Record<NotificationKind, [string, string]> = {
  OFFER_RECEIVED: ["→", "You received a private offer"],
  COUNTER_RECEIVED: ["⇄", "You received a counteroffer"],
  OFFER_FILLED: ["✓", "Your offer was accepted"],
  OFFER_PARTIALLY_FILLED: ["½", "Your offer was partially filled"],
  OFFER_REJECTED: ["×", "Your private offer was rejected"],
  OFFER_EXPIRED: ["⌛", "Your offer expired"],
  OFFER_CANCELLED: ["×", "An offer to you was withdrawn"],
};

export function NotificationsCard() {
  const { list, seen, markAllRead, loaded } = useNotifications();
  const now = useNow();
  // amounts need token decimals: resolve via the offer when present
  const { data: decs } = useAsync(async () => {
    const out: Record<string, number> = {};
    const svc = getService();
    await Promise.all(list.map(async (n) => { try { out[n.offer] = (await svc.getOtcOffer(n.offer)).offer.token.decimals; } catch { /* offer gone */ } }));
    return out;
  }, [list.map((n) => n.id).join(",")], { enabled: list.length > 0 });

  if (!loaded) return <Skeleton h={120} />;
  if (!list.length) {
    return <div className="empty">No notifications. You get one when someone sends you a private offer or counteroffer, or when your offer fills, expires or is rejected.</div>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" data-testid="notifications">
      <div className="flex items-center justify-between border-b border-stone px-4 py-3">
        <b className="display text-lg font-semibold uppercase tracking-[0.04em]">Notifications</b>
        <button type="button" className="chip" onClick={markAllRead}>Mark all read</button>
      </div>
      {list.map((n) => {
        const [ic, title] = NOTE[n.kind];
        const isNew = n.ts > seen;
        const dec = decs?.[n.offer];
        const detail = n.lamports !== undefined ? `${n.amount !== undefined && dec !== undefined ? `${tamt(n.amount, { decimals: dec })} ${n.symbol ? "$" + n.symbol : ""} for ` : ""}${stl(n.lamports)}` : n.symbol ? `$${n.symbol}` : "";
        return (
          <Link key={n.id} href={`/otc/offer/${n.offer}`} className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-stone px-4 py-3 text-sm no-underline last:border-0 hover:bg-paper ${isNew ? "bg-gold-soft/40" : ""}`}>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-stone text-sm font-bold" aria-hidden="true">{ic}</span>
            <span className="min-w-0"><b>{title}</b>{isNew && <span className="mono ml-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold">NEW</span>}<br /><span className="mono text-xs text-muted">{detail}{n.needsClose ? " · close it to get your assets back" : ""}</span></span>
            <span className="mono text-xs text-muted">{now ? age(n.ts, now) : ""}</span>
          </Link>
        );
      })}
    </div>
  );
}
