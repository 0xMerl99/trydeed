"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { ClosedLotCard, LotCard } from "@/components/auctions/cards";
import { DeedCertificate } from "@/components/deed/DeedCertificate";
import { useData } from "@/components/providers/DataProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { AddressLink } from "@/components/ui/Explorer";
import { PageTitle } from "@/components/ui/PageTitle";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from "@/components/ui/States";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { useAsync } from "@/hooks/useAsync";
import { useTx } from "@/hooks/useTx";
import { fmtUnits } from "@/lib/otc";
import { short } from "@/lib/format";
import { mcap, sol, solOrDash } from "@/lib/sol";
import { getService } from "@/services";
import type { Portfolio } from "@/types";

type Tab = "coins" | "deeds" | "auctions" | "bids" | "refunds" | "fees" | "holdings" | "history";

export function PortfolioView() {
  return <ConnectGate eyebrow="Portfolio">{(address) => <Body address={address} />}</ConnectGate>;
}

function Body({ address }: { address: string }) {
  const { refresh } = useData();
  const { run, busy } = useTx();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("deeds");
  const { data: pf, error, loading, reload } = useAsync(() => getService().getPortfolio(address), [address], { refreshMs: 20_000 });

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !pf) return <div className="wrap pt-10"><ErrorState error={error ?? new Error("Couldn’t load your portfolio")} onRetry={reload} /></div>;

  const claimable = pf.assets.reduce((s, c) => s + c.fees.claimable, 0n);
  const activeBids = pf.bids.filter((b) => b.auctionView.status === "LIVE" && b.status !== "WON");

  const after = async () => { await Promise.all([reload(), refresh()]); };
  const claim = async (mint: string) => { if (await run((ctx) => getService().claimFees(ctx, mint))) await after(); };
  const sell = (mint: string) => router.push(`/sell?coin=${mint}`);

  const tabs: TabDef<Tab>[] = [
    { key: "deeds", label: "My Deeds", count: pf.assets.length },
    { key: "coins", label: "My Coins", count: pf.coins.length },
    { key: "auctions", label: "My Auctions", count: pf.auctions.length },
    { key: "bids", label: "My Bids", count: pf.bids.length },
    { key: "fees", label: "Fees", count: pf.assets.length },
    { key: "holdings", label: "Token holdings" },
    { key: "history", label: "History", count: pf.history.length },
  ];

  return (
    <div className="wrap">
      <PageTitle eyebrow={<>Portfolio · <span className="normal-case">{short(address)}</span></>} lead="Your" hl="holdings" />
      <div className="my-6 grid grid-cols-2 gap-4 w981:grid-cols-4" data-testid="portfolio-summary">
        <Tile label="Deeds held" value={String(pf.assets.length)} />
        <Tile label="Claimable now" value={<span data-hl>{sol(claimable)} SOL</span>} />
        <Tile label="Coins launched" value={String(pf.coins.length)} />
        <Tile label="Active bids" value={String(activeBids.length)} />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Portfolio sections" />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "deeds" && (
          pf.assets.length ? (
            <div className="grid grid-cols-1 gap-5 w640:grid-cols-2 w981:grid-cols-3">
              {pf.assets.map((c) => (
                <DeedCertificate key={c.mint} coin={c} holder={c.deedOwner}
                  footer={
                    <>
                      <Button size="sm" onClick={() => sell(c.mint)}>Sell on Auction</Button>
                      {c.fees.claimable > 0n && <Button size="sm" variant="gold" disabled={busy} onClick={() => claim(c.mint)}>Claim {sol(c.fees.claimable)} SOL</Button>}
                    </>
                  } />
              ))}
            </div>
          ) : <EmptyState>You don’t hold any Deeds. <Link className="link" href="/launch">Launch a coin</Link> or win an auction to get one.</EmptyState>
        )}

        {tab === "coins" && (
          pf.coins.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Coin</th><th>Market cap</th><th>Lifetime fees</th><th>24h fees</th><th>Deed holder</th><th /></tr></thead>
              <tbody>
                {pf.coins.map((c) => (
                  <tr key={c.mint}>
                    <td><div className="flex items-center gap-2.5"><Avatar coin={c} size="sm" /><div><b>{c.name}</b><div className="mono text-xs text-muted">${c.symbol}</div></div></div></td>
                    <td className="num">{mcap(c.market.marketCapSol)}</td>
                    <td className="num">{sol(c.fees.lifetime)} SOL</td>
                    <td className="num">{solOrDash(c.fees.d24)}</td>
                    <td>{c.deedOwner === address ? <Pill tone="live">You</Pill> : c.liveAuction ? <Pill>Auction escrow</Pill> : <Pill><AddressLink value={c.deedOwner} /></Pill>}</td>
                    <td className="right">{c.deedOwner === address ? <Button size="sm" onClick={() => sell(c.mint)}>Sell on Auction</Button> : c.liveAuction ? <Button size="sm" href={`/auctions/${c.liveAuction}`}>View auction</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <EmptyState>You haven’t launched a coin yet. <Link className="link" href="/launch">Launch one</Link>.</EmptyState>
        )}

        {tab === "auctions" && (
          pf.auctions.length ? (
            <div className="grid grid-cols-1 gap-[22px] w640:grid-cols-2 w981:grid-cols-3">
              {pf.auctions.map((a) => (a.status === "LIVE" ? <LotCard key={a.address} a={a} /> : <ClosedLotCard key={a.address} a={a} />))}
            </div>
          ) : <EmptyState>No auctions yet. <Link className="link" href="/sell">Sell on Auction</Link>.</EmptyState>
        )}

        {tab === "bids" && (
          pf.bids.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Lot</th><th>Your bid</th><th>Current bid</th><th>Status</th><th>Time left</th><th /></tr></thead>
              <tbody>
                {pf.bids.map((b) => {
                  const a = b.auctionView;
                  return (
                    <tr key={b.auction}>
                      <td><div className="flex items-center gap-2.5"><Avatar coin={a.coin} size="sm" /><b>${a.coin.symbol}</b></div></td>
                      <td className="num">{sol(b.amount, { max: 9 })} SOL</td>
                      <td className="num">{sol(a.highestBid, { max: 9 })} SOL</td>
                      <td>{b.status === "HIGHEST" ? <Pill tone="gold">Highest bid</Pill> : <Pill tone="live">Won</Pill>}</td>
                      <td className="num">{a.status === "LIVE" ? <Countdown end={a.endTs} /> : a.status}</td>
                      <td className="right"><Button size="sm" href={`/auctions/${a.address}`}>View</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <EmptyState>You have no bids.</EmptyState>
        )}

        {tab === "fees" && (
          pf.assets.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Coin</th><th>Lifetime</th><th>Claimed</th><th>Unclaimed</th><th>24h</th><th /></tr></thead>
              <tbody>
                {pf.assets.map((c) => (
                  <tr key={c.mint}>
                    <td><div className="flex items-center gap-2.5"><Avatar coin={c} size="sm" /><b>${c.symbol}</b></div></td>
                    <td className="num">{sol(c.fees.lifetime)} SOL</td>
                    <td className="num">{sol(c.fees.claimed)} SOL</td>
                    <td className="num"><span data-hl>{sol(c.fees.unclaimed)} SOL</span></td>
                    <td className="num">{solOrDash(c.fees.d24)}</td>
                    <td className="right">{c.fees.claimable > 0n ? <Button size="sm" variant="gold" disabled={busy} onClick={() => claim(c.mint)}>Claim {sol(c.fees.claimable)} SOL</Button> : <Button size="sm" disabled>Claim Fees</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <EmptyState>Creator fees appear here for Deeds you hold.</EmptyState>
        )}

        {tab === "holdings" && <Holdings address={address} />}

        {tab === "history" && (
          pf.history.length ? (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">{pf.history.map((e) => <ActivityRow key={e.id} e={e} showRef />)}</div>
          ) : <EmptyState>No activity for this wallet yet.</EmptyState>
        )}
      </div>

      <p className="muted mt-6 text-xs">Creator fees stay with the Deed. Claiming withdraws them to your wallet. Unclaimed fees always transfer with the Deed to its next holder.</p>
    </div>
  );
}

const Tile = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="panel !p-4">
    <span className="mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-ink">{label}</span>
    <b className="mono mt-2 block text-2xl font-semibold">{value}</b>
  </div>
);

/** Real SPL balances straight from the RPC. */
function Holdings({ address }: { address: string }) {
  const { data, error, loading, reload } = useAsync(() => getService().getWalletTokens(address), [address]);
  if (loading) return <Skeleton h={160} />;
  if (error || !data) return <ErrorState error={error ?? new Error("Couldn’t read balances")} onRetry={reload} />;
  return (
    <>
      <p className="muted mb-3 mt-0 text-sm">
        Public token balances read from Solana{data.sol !== null && <> · <b className="text-ink">{sol(data.sol)} SOL</b></>}.
      </p>
      {data.tokens.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Token</th><th>Amount</th><th /></tr></thead>
          <tbody>
            {data.tokens.map((t) => (
              <tr key={t.mint}>
                <td><div className="flex items-center gap-2.5"><Avatar coin={{ symbol: t.symbol, image: t.image }} size="sm" /><div><b>{t.symbol ? `$${t.symbol}` : "Unknown token"}</b><div className="mono text-xs text-muted">{short(t.mint)}</div></div></div></td>
                <td className="num">{fmtUnits(t.amount, t.decimals)}</td>
                <td className="right"><Button size="sm" href={`/otc/token/${t.mint}`}>OTC market</Button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : <EmptyState>This wallet holds no tokens.</EmptyState>}
    </>
  );
}
