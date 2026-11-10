"use client";
import Link from "next/link";
import { useData } from "@/components/providers/DataProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ArrowLeftIcon } from "@/components/ui/Icons";
import { PageSkeleton, ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { useNow } from "@/hooks/useNow";
import { mcap, sol, solOrDash } from "@/lib/sol";
import { age } from "@/lib/time";
import { getService } from "@/services";
import { BidBox } from "./BidBox";
import { BidHistory } from "./BidHistory";
import { useDeedWallet } from "@/components/wallet/DeedWallet";

export function AuctionDetailView({ address }: { address: string }) {
  const { refresh } = useData();
  const now = useNow();
  const { address: me } = useDeedWallet();
  const { data, error, loading, reload } = useAsync(() => getService().getAuction(address), [address], { refreshMs: 15_000 });

  const changed = async () => {
    await Promise.all([reload(), refresh()]);
  };

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !data) {
    return (
      <div className="wrap pt-10">
        <ErrorState error={error ?? new Error("Auction not found")} onRetry={reload} back={{ href: "/auctions", label: "Back to auctions" }} />
      </div>
    );
  }
  const a = data.auction;
  const c = a.coin;

  return (
    <div className="wrap">
      <Link href="/auctions" className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:underline">
        <ArrowLeftIcon size={16} /> All auctions
      </Link>

      <div className="grid gap-7 pb-10 pt-5 w981:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[22px]">
          <div className="flex items-center gap-5">
            <Avatar coin={c} size="xl" />
            <div className="min-w-0">
              <span className="eyebrow">Deed · ${c.symbol}</span>
              <h1 className="display my-2 break-words text-[clamp(30px,4vw,46px)] font-semibold leading-[1.05] tracking-tight">{c.name}</h1>
              <span className="mono text-sm text-muted">${c.symbol} · Coin age {now ? age(c.createdAt, now) : "—"}</span>
            </div>
          </div>

          <div className="notice">
            You’re bidding on the <b>Deed and its creator-fee rights</b>, not the token supply. Unclaimed fees (<b>{sol(c.fees.unclaimed)} SOL</b> right now) transfer with the Deed to the winner.
          </div>

          <div className="stat-grid" data-testid="stat-grid">
            <div className="kv"><span>Lifetime fees</span><b>{sol(c.fees.lifetime)} SOL</b></div>
            <div className="kv"><span>24h fees</span><b>{solOrDash(c.fees.d24)}</b></div>
            <div className="kv"><span>7d fees</span><b>{solOrDash(c.fees.d7)}</b></div>
            <div className="kv"><span>Unclaimed</span><b data-hl>{sol(c.fees.unclaimed)} SOL</b></div>
            <div className="kv"><span>Market cap</span><b>{mcap(c.market.marketCapSol)}</b></div>
            <div className="kv"><span>Completed sales</span><b>{c.sales}</b></div>
            <div className="kv"><span>Coin age</span><b>{now ? age(c.createdAt, now) : "—"}</b></div>
            <div className="kv"><span>Bids</span><b>{a.bidCount}</b></div>
          </div>

          <section className="panel">
            <h2>Bid history</h2>
            <BidHistory auction={a} history={data.history} me={me} />
          </section>
        </div>

        <aside className="sticky-panel min-w-0">
          <BidBox detail={data} onChanged={changed} />
        </aside>
      </div>
    </div>
  );
}
