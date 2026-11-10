"use client";
import { useMemo, useState } from "react";
import { NotificationsCard } from "@/components/otc/Notifications";
import { useData } from "@/components/providers/DataProvider";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import type { ActivityEvent } from "@/types";
import { ActivityRow } from "./ActivityRow";

type F = "all" | "bids" | "auctions" | "deeds" | "otc" | "launches" | "mine";
const FILTERS: [F, string][] = [["all", "All"], ["bids", "Bids"], ["auctions", "Auctions"], ["deeds", "Deeds"], ["otc", "OTC"], ["launches", "Launches"], ["mine", "My wallet"]];

export function ActivityView() {
  const { activity, loaded, error } = useData();
  const w = useDeedWallet();
  const [f, setF] = useState<F>("all");

  const test: Record<F, (e: ActivityEvent) => boolean> = {
    all: () => true,
    bids: (e) => e.kind === "BID_PLACED",
    auctions: (e) => ["BID_PLACED", "AUCTION_CREATED", "AUCTION_SETTLED", "AUCTION_CANCELLED", "AUCTION_UNSOLD"].includes(e.kind),
    deeds: (e) => ["DEED_TRANSFERRED", "FEES_CLAIMED", "COIN_LAUNCHED"].includes(e.kind),
    otc: (e) => e.kind.startsWith("OTC_"),
    launches: (e) => e.kind === "COIN_LAUNCHED",
    mine: (e) => !!w.address && (e.actor === w.address || e.counterparty === w.address),
  };
  const list = useMemo(() => activity.filter(test[f]), [activity, f, w.address]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wrap">
      <PageTitle eyebrow="Activity" lead="Everything," hl="on-chain">
        Confirmed program events: bids, listings, completed auctions, Deed transfers, fee claims, launches and public OTC trades. Private offers are shown only to the two wallets involved.
      </PageTitle>

      <div className={`mt-6 grid items-start gap-6 ${w.address ? "w981:grid-cols-2" : ""}`}>
        {w.address && <div><NotificationsCard /></div>}
        <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Live activity">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone px-4 py-3">
            <b className="display text-lg font-semibold uppercase tracking-[0.04em]">Live activity</b>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter activity">
              {FILTERS.filter(([k]) => k !== "mine" || w.address).map(([k, l]) => (
                <button key={k} type="button" className="chip !px-3 !py-1 !text-xs" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div data-testid="activity-list">
            {!loaded ? <div className="p-4"><Skeleton h={160} /></div> : error && !activity.length ? <div className="p-4"><ErrorState error={error} /></div> : list.length ? list.map((e) => <ActivityRow key={e.id} e={e} showRef />) : <p className="muted m-0 px-[18px] py-4 text-sm">Nothing here yet.</p>}
          </div>
        </section>
      </div>

      {!w.address && (
        <div className="empty mt-5">
          Connect your wallet to see notifications about offers sent to you and your offers filling.{" "}
          <Button size="sm" variant="gold" className="ml-2" onClick={w.openPicker}>Connect Wallet</Button>
        </div>
      )}
    </div>
  );
}
