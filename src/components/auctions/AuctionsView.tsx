"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { PageTitle } from "@/components/ui/PageTitle";
import { useNow } from "@/hooks/useNow";
import { auctionPhase, currentBid } from "@/lib/auction";
import type { Auction } from "@/types";
import { ClosedLotCard, LotCard } from "./cards";

const FILTERS = [
  ["ending", "Ending Soon"],
  ["new", "Newest"],
  ["bid", "Highest Bid"],
  ["life", "Highest Lifetime Fees"],
  ["bids", "Most Bids"],
  ["ended", "Ended"],
] as const;
type F = (typeof FILTERS)[number][0];

const SORTS: Record<F, (x: Auction, y: Auction) => number> = {
  ending: (x, y) => x.endTs - y.endTs,
  new: (x, y) => y.startTs - x.startTs,
  bid: (x, y) => (currentBid(y) > currentBid(x) ? 1 : currentBid(y) < currentBid(x) ? -1 : 0),
  life: (x, y) => (y.coin.fees.lifetime > x.coin.fees.lifetime ? 1 : y.coin.fees.lifetime < x.coin.fees.lifetime ? -1 : 0),
  bids: (x, y) => y.bidCount - x.bidCount,
  ended: (x, y) => y.endTs - x.endTs,
};

export function AuctionsView() {
  const { auctions, loaded, error } = useData();
  const now = useNow();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const f = (FILTERS.some(([k]) => k === params.get("f")) ? params.get("f") : "ending") as F;
  const [q, setQ] = useState("");

  const setF = (k: F) => router.replace(k === "ending" ? path : `${path}?f=${k}`, { scroll: false });

  const list = useMemo(() => {
    const live = (a: Auction) => a.status === "LIVE" && (!now || auctionPhase(a, now) === "LIVE");
    let l = f === "ended" ? auctions.filter((a) => !live(a)) : auctions.filter(live);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((a) => [a.coin.name, a.coin.symbol, a.coinMint].some((v) => v.toLowerCase().includes(s)));
    return [...l].sort(SORTS[f]);
  }, [auctions, f, q, now]);

  return (
    <div className="wrap">
      <PageTitle eyebrow="Catalogue" lead="Live" hl="Auctions">
        Every lot is a Deed: a 1/1 Ownership NFT carrying a coin’s creator-fee rights. The token supply is not for sale.
      </PageTitle>
      <section className="py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sort and filter">
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={f === k} onClick={() => setF(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px] flex-1">
            <input
              type="search"
              className="input"
              placeholder="Search coin name, ticker or mint address"
              aria-label="Search auctions"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {!loaded ? (
          <CardGridSkeleton n={3} h={300} cols="grid-cols-1 w640:grid-cols-2 w981:grid-cols-3" />
        ) : error && !auctions.length ? (
          <ErrorState error={error} />
        ) : list.length ? (
          <div className="grid grid-cols-1 gap-[22px] w640:grid-cols-2 w981:grid-cols-3" data-testid="lot-grid">
            {list.map((a) => (a.status === "LIVE" ? <LotCard key={a.address} a={a} /> : <ClosedLotCard key={a.address} a={a} />))}
          </div>
        ) : (
          <EmptyState>{q ? `No lots match “${q}”.` : f === "ended" ? "No ended auctions yet." : "Nothing here yet."}</EmptyState>
        )}
      </section>
    </div>
  );
}
