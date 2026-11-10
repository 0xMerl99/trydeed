"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { MintLine, AddressLink } from "@/components/ui/Explorer";
import { ArrowLeftIcon } from "@/components/ui/Icons";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageSkeleton } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useAsync } from "@/hooks/useAsync";
import { useNow } from "@/hooks/useNow";
import { fmtUnitPrice, unitPriceNumber } from "@/lib/otc";
import { until } from "@/lib/time";
import { getService } from "@/services";
import type { OtcOffer, OtcToken } from "@/types";
import { OfferForm } from "./OfferForm";
import { Kpi, KpiStrip, TradesTable, perToken, refPrice, stl, tamt, vsRef } from "./shared";

export function TokenHeader({ t }: { t: OtcToken }) {
  return (
    <div className="panel mb-4">
      <div className="flex items-center gap-5">
        <Avatar coin={{ image: t.image, symbol: t.symbol || "?" }} size="xl" />
        <div className="min-w-0 flex-1">
          <span className="eyebrow">OTC market · {t.standard}</span>
          <h1 className="display my-2 break-words text-[clamp(28px,4vw,44px)] font-semibold leading-tight tracking-tight">
            {t.symbol ? `$${t.symbol}` : "Unknown token"} <span className="text-xl font-medium text-muted">{t.name}</span>
          </h1>
          <div className="flex flex-wrap gap-1.5">
            {t.platformCoin ? <Pill tone="gold">Launched on Deed</Pill> : <Pill>User-listed · not verified</Pill>}
            {!t.supported && <Pill tone="hot">Not supported</Pill>}
            {t.transferFee && <Pill tone="hot">Transfer fee</Pill>}
          </div>
        </div>
      </div>
      <div className="mt-4"><MintLine mint={t.mint} /></div>
      <dl className="dl mt-4 max-w-[560px]">
        <dt>Decimals</dt><dd>{t.decimals}</dd>
        <dt>Supply</dt><dd>{t.supply ? tamt(t.supply, t, 0) : "—"}</dd>
        <dt>Mint authority</dt><dd>{t.mintAuthority ? <AddressLink value={t.mintAuthority} /> : "none (fixed supply)"}</dd>
        <dt>Freeze authority</dt><dd>{t.freezeAuthority ? <AddressLink value={t.freezeAuthority} /> : "none"}</dd>
      </dl>
    </div>
  );
}

export function WarningList({ t }: { t: OtcToken }) {
  const items: { text: string; bad?: boolean }[] = [];
  if (!t.supported && t.reason) items.push({ text: `Not tradable here. ${t.reason}.`, bad: true });
  for (const w of t.warnings) items.push({ text: w });
  if (!items.length) return null;
  return (
    <ul className="mb-4 flex list-none flex-col gap-2 p-0" aria-label="Token warnings">
      {items.map((i) => <li key={i.text} className={`${i.bad ? "warn font-semibold" : "notice"} text-[13.5px]`}>{i.text}</li>)}
    </ul>
  );
}

function Book({ list, t, kind, me, refPx }: { list: OtcOffer[]; t: OtcToken; kind: "SELL" | "BUY"; me: string | null; refPx?: number | null }) {
  const now = useNow();
  if (!list.length) return <p className="muted m-0 text-sm">{kind === "SELL" ? "No public sell offers." : "No public buy bids."}</p>;
  // Three columns (price, amount, total + action) so the book fits a half-width panel without clipping.
  return (
    <div className="tbl-wrap !border-0 !bg-transparent">
      <table className="tbl [&_td]:!px-2.5 [&_th]:!px-2.5">
        <thead><tr><th>Price / token</th><th>Amount</th><th className="right">Total</th></tr></thead>
        <tbody>
          {list.map((o) => {
            const p = unitPriceNumber(o.priceRemaining, o.remaining, t.decimals);
            return (
              <tr key={o.address} data-testid="book-row">
                <td className="num"><b className={kind === "SELL" ? "text-danger" : "text-live"}>{fmtUnitPrice(o.priceRemaining, o.remaining, t.decimals)}</b>{vsRef(p, refPx)}</td>
                <td className="num">{tamt(o.remaining, t)}{o.remaining < o.amountTotal && <span className="block text-xs text-muted">of {tamt(o.amountTotal, t)}</span>}{o.minFill < o.remaining && <span className="block text-xs text-muted">partial ok</span>}</td>
                <td className="num right">
                  {stl(o.priceRemaining)}
                  <span className="block text-xs text-muted">{now ? until(o.expiresAt, now) : ""}</span>
                  <span className="mt-1 inline-block">{o.maker === me ? <Pill>Yours</Pill> : <Button size="sm" href={`/otc/offer/${o.address}`}>{kind === "SELL" ? "Buy" : "Sell"}</Button>}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OtcTokenView({ mint }: { mint: string }) {
  const { address: me } = useDeedWallet();
  const sp = useSearchParams();
  const { data: r, error, loading, reload } = useAsync(() => getService().getOtcToken(mint), [mint], { refreshMs: 20_000 });

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !r) {
    return (
      <div className="wrap pt-8">
        <Link href="/otc" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:underline"><ArrowLeftIcon size={16} /> OTC Markets</Link>
        <div className="warn mb-3"><b>Cannot open this market.</b> {error?.message ?? "Unknown token"}.</div>
        <MintLine mint={mint} />
        <div className="mt-4"><Button size="sm" onClick={reload}>Try again</Button></div>
      </div>
    );
  }
  const t = r.token;
  const kind = sp.get("kind") === "buy" ? "BUY" : sp.get("kind") === "sell" ? "SELL" : undefined;
  return (
    <div className="wrap">
      <Link href="/otc" className="mt-7 mb-3 inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:underline"><ArrowLeftIcon size={16} /> OTC Markets</Link>
      <TokenHeader t={t} />
      <WarningList t={t} />
      <KpiStrip>
        <Kpi label="Best ask">{perToken(r.bestAsk)} <small className="text-[11px] font-medium text-muted">SOL</small></Kpi>
        <Kpi label="Best bid">{perToken(r.bestBid)} <small className="text-[11px] font-medium text-muted">SOL</small></Kpi>
        <Kpi label="Reference price">{refPrice(t.refPriceSol)} <small className="text-[11px] font-medium text-muted">SOL</small><span className="block text-[11px] font-normal normal-case tracking-normal text-muted">{t.refPriceSol ? "comparison only" : "no price found"}</span></Kpi>
        <Kpi label="OTC volume 24h">{stl(r.volume24h)}</Kpi>
        <Kpi label="Trades 24h">{r.trades24h}</Kpi>
      </KpiStrip>

      <div className="grid gap-7 pb-10 pt-5 w981:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* stacked, not side by side: each book needs room for price, amount, total and the action */}
          <div className="grid gap-[18px]">
            <section className="panel"><h2><span>Sell offers</span><Pill>{r.asks.length}</Pill></h2><Book list={r.asks} t={t} kind="SELL" me={me} refPx={t.refPriceSol} /></section>
            <section className="panel"><h2><span>Buy bids</span><Pill>{r.bids.length}</Pill></h2><Book list={r.bids} t={t} kind="BUY" me={me} refPx={t.refPriceSol} /></section>
          </div>
          <section className="panel"><h2>Recent trades</h2><TradesTable trades={r.trades} token={t} /></section>
          <p className="muted m-0 text-xs">Private offers are not listed. The reference price is public market data shown for comparison only; OTC prices are whatever maker and taker agree. OTC trades never touch liquidity pools or the public chart.</p>
        </div>
        <aside className="sticky-panel min-w-0">
          {t.supported ? <OfferForm key={`${mint}-${kind}-${sp.get("cp")}`} token={t} feeBps={r.feeBps} initial={{ kind, counterparty: sp.get("cp") ?? undefined }} /> : <div className="panel"><h2>Offers disabled</h2><p className="muted m-0">This token can’t be traded safely through the escrow.</p></div>}
        </aside>
      </div>
    </div>
  );
}
