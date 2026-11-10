"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/States";
import { PageTitle } from "@/components/ui/PageTitle";
import type { Coin } from "@/types";
import { CoinCard } from "./CoinCard";

const SORTS = [
  ["new", "Newest"],
  ["mcap", "Market cap"],
  ["fees", "Lifetime fees"],
  ["live", "On auction"],
  ["sold", "Sold"],
] as const;
type S = (typeof SORTS)[number][0];

const cmp: Record<"new" | "mcap" | "fees", (a: Coin, b: Coin) => number> = {
  new: (a, b) => b.launchedAt - a.launchedAt,
  mcap: (a, b) => {
    const x = a.market.marketCapSol ?? 0n;
    const y = b.market.marketCapSol ?? 0n;
    return y > x ? 1 : y < x ? -1 : 0;
  },
  fees: (a, b) => (b.fees.lifetime > a.fees.lifetime ? 1 : b.fees.lifetime < a.fees.lifetime ? -1 : 0),
};

export function CoinsView() {
  const { coins, loaded, error } = useData();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [sort, setSort] = useState<S>("new");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQ(urlQ), [urlQ]); // the header search drives this too
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const list = useMemo(() => {
    let l = [...coins];
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((c) => [c.name, c.symbol, c.mint, c.creator].some((v) => v.toLowerCase().includes(s)));
    if (sort === "live") l = l.filter((c) => c.status === "ON_AUCTION");
    if (sort === "sold") l = l.filter((c) => c.sales > 0);
    return l.sort(cmp[sort === "live" || sort === "sold" ? "new" : sort]);
  }, [coins, q, sort]);

  return (
    <div className="wrap">
      <PageTitle eyebrow="Launched on Deed" lead="Every" hl="coin">
        All coins launched through Deed. Each one has a 1/1 Ownership NFT that holds 100% of its creator fees.
      </PageTitle>
      <section className="py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sort and filter">
            {SORTS.map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="min-w-[220px] flex-1">
            <input
              type="search"
              className="input"
              placeholder="Search coin name, ticker, mint or creator"
              aria-label="Search coins"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                const v = e.target.value;
                timer.current = setTimeout(() => router.replace(v.trim() ? `${path}?q=${encodeURIComponent(v.trim())}` : path, { scroll: false }), 300);
              }}
            />
          </div>
        </div>
        {!loaded ? (
          <CardGridSkeleton n={4} />
        ) : error && !coins.length ? (
          <ErrorState error={error} />
        ) : list.length ? (
          <div className="grid grid-cols-1 gap-4 w640:grid-cols-2 w901:grid-cols-3 w1181:grid-cols-4" data-testid="coin-grid">
            {list.map((c) => (
              <CoinCard key={c.mint} c={c} />
            ))}
          </div>
        ) : (
          <EmptyState>{q ? `No coins match “${q}”.` : "No coins here yet."}</EmptyState>
        )}
      </section>
    </div>
  );
}
