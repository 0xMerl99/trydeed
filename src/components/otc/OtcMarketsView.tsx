"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useNow } from "@/hooks/useNow";
import { looksLikeAddress } from "@/lib/format";
import { sol } from "@/lib/sol";
import { ago } from "@/lib/time";
import { getService } from "@/services";
import type { OtcMarketRow } from "@/types";
import { Kpi, KpiStrip, TokenLabel, TradesTable, perToken, refPrice, stl } from "./shared";

const SORTS = [
  ["volume", "Volume 24h"],
  ["asks", "Most offers"],
  ["bids", "Most bids"],
  ["recent", "Latest trade"],
  ["new", "Newest market"],
  ["verified", "Launched here"],
] as const;
type S = (typeof SORTS)[number][0];

export function OtcMarketsView() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { data, error, loading, reload } = useAsync(async () => {
    const s = getService();
    const [stats, markets] = await Promise.all([s.getOtcStats(), s.listOtcMarkets()]);
    return { stats, markets };
  }, [], { refreshMs: 20_000 });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<S>("volume");

  const list = useMemo(() => {
    let l = [...(data?.markets ?? [])];
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((m) => [m.mint, m.token.name, m.token.symbol].some((v) => String(v ?? "").toLowerCase().includes(s)));
    if (sort === "verified") l = l.filter((m) => m.token.platformCoin);
    const by: Record<S, (a: OtcMarketRow, b: OtcMarketRow) => number> = {
      volume: (a, b) => (b.volume24h > a.volume24h ? 1 : b.volume24h < a.volume24h ? -1 : b.asks + b.bids - a.asks - a.bids),
      asks: (a, b) => b.asks - a.asks,
      bids: (a, b) => b.bids - a.bids,
      recent: (a, b) => (b.lastTradeTs ?? 0) - (a.lastTradeTs ?? 0),
      new: (a, b) => b.firstSeen - a.firstSeen,
      verified: (a, b) => b.asks + b.bids - a.asks - a.bids,
    };
    return l.sort(by[sort]);
  }, [data, q, sort]);

  const s = data?.stats;
  const qt = q.trim();
  const unknownMint = looksLikeAddress(qt) && !list.some((m) => m.mint === qt);

  return (
    <div className="wrap">
      <PageTitle eyebrow="OTC Markets" lead="Trade any token," hl="wallet to wallet">
        Make or take offers on any Solana SPL or Token-2022 token, priced in SOL. Sell offers lock the tokens in escrow; buy bids lock the SOL. A fill swaps both sides in one transaction, or nothing happens. OTC trades never touch liquidity pools or the public chart.
      </PageTitle>

      <div className="mt-6">
        {loading ? <Skeleton h={72} /> : (
          <KpiStrip>
            <Kpi label="Active sell offers">{s?.activeOffers ?? 0}</Kpi>
            <Kpi label="Active buy bids">{s?.activeBids ?? 0}</Kpi>
            <Kpi label="Trades settled">{s?.trades ?? 0}</Kpi>
            <Kpi label="Volume">{sol(s?.volume ?? 0n)} <small className="text-[11px] font-medium text-muted">SOL</small></Kpi>
            <Kpi label="Trading fee">{s ? `${s.feeBps / 100}%` : "—"}</Kpi>
          </KpiStrip>
        )}
      </div>

      <form
        className="mb-4 mt-5 flex flex-wrap gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (looksLikeAddress(qt)) router.push(`/otc/token/${qt}`);
          else if (qt && list[0]) router.push(`/otc/token/${list[0].mint}`);
          else toast("Paste a token mint address (32–44 characters)", "error");
        }}
      >
        <div className="min-w-[240px] flex-1">
          <input id="oq" type="search" className="input" placeholder="Search by name, symbol, or paste any token mint address" aria-label="Search tokens" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="gold">Open market</Button>
        <Button href="/otc/wallet">Wallet lookup</Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Sort markets">
        {SORTS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skeleton h={220} /> : (
        <>
          {unknownMint && (
            <div className="empty mb-3.5">No offers for <span className="mono">{qt.slice(0, 4)}…{qt.slice(-4)}</span> yet. <Link className="link" href={`/otc/token/${qt}`}>Open its market</Link> to see the token and make the first offer.</div>
          )}
          {list.length ? (
            <div className="tbl-wrap">
              <table className="tbl" data-testid="markets-table">
                <thead><tr><th>Token</th><th>Best ask (SOL)</th><th>Best bid (SOL)</th><th>Reference</th><th>Offers</th><th>Bids</th><th>Volume 24h</th><th>Last trade</th></tr></thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.mint} className="click" tabIndex={0} onClick={() => router.push(`/otc/token/${m.mint}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/otc/token/${m.mint}`)}>
                      <td><TokenLabel t={m.token} mint={m.mint} /></td>
                      <td className="num">{perToken(m.bestAsk)}</td>
                      <td className="num">{perToken(m.bestBid)}</td>
                      <td className="num">{refPrice(m.token.refPriceSol)}</td>
                      <td className="num">{m.asks}</td>
                      <td className="num">{m.bids}</td>
                      <td className="num">{stl(m.volume24h)}</td>
                      <td className="text-muted">{m.lastTradeTs && now ? ago(m.lastTradeTs, now) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !unknownMint && <EmptyState>{qt ? `No markets match “${qt}”. Paste a mint address to open any token.` : "No OTC offers yet. Paste any token mint above to make the first one."}</EmptyState>}
        </>
      )}

      <section className="mt-9">
        <h2 className="display m-0 mb-3 text-[26px] font-semibold tracking-tight">Recent OTC trades</h2>
        {loading ? <Skeleton h={120} /> : <div className="rounded-xl border border-line bg-surface p-1"><TradesTable trades={data?.stats.recent ?? []} /></div>}
      </section>

      <div className="notice mt-6"><b>Anyone can list any token.</b> A listing here is not an endorsement. Names and logos come from token metadata and can be copied by scammers: always compare the full mint address before you trade.</div>
    </div>
  );
}
