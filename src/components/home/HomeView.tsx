"use client";
import Link from "next/link";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { EndingCard, SoldCard } from "@/components/auctions/cards";
import { CoinCard } from "@/components/coins/CoinCard";
import { ChalkDoodles } from "./ChalkDoodles";
import { DeedCertificate } from "@/components/deed/DeedCertificate";
import { useData } from "@/components/providers/DataProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { FavButton } from "@/components/ui/FavButton";
import { ClockIcon, CoinIcon, GavelIcon, RocketIcon, TrophyIcon } from "@/components/ui/Icons";
import { currentBid, auctionPhase } from "@/lib/auction";
import { mcap, sol } from "@/lib/sol";
import { useNow } from "@/hooks/useNow";
import type { Auction, Coin } from "@/types";

const STEPS = [
  ["01", "LAUNCH", "Launch a coin through Deed."],
  ["02", "RECEIVE", "Automatically receive a unique 1/1 Ownership NFT called the Deed."],
  ["03", "OWN", "Hold the Deed to control and claim 100% of the coin’s creator fees."],
  ["04", "AUCTION", "Auction the Deed. The highest bidder takes over future fee rights."],
] as const;

export function HomeView() {
  const { auctions, coins, activity, loaded, status } = useData();
  const now = useNow();

  const live = auctions.filter((a) => a.status === "LIVE" && (!now || auctionPhase(a, now) === "LIVE")).sort((x, y) => x.endTs - y.endTs);
  const sold = auctions.filter((a) => a.status === "SETTLED").sort((x, y) => y.endTs - x.endTs);
  const floor = [...live].sort((x, y) => (currentBid(y) > currentBid(x) ? 1 : currentBid(y) < currentBid(x) ? -1 : y.bidders - x.bidders))[0];
  const launched = [...coins].sort((x, y) => y.launchedAt - x.launchedAt);
  const total = coins.reduce((t, c) => t + c.fees.lifetime, 0n);
  const feePct = (status?.feeBps ?? 100) / 100;
  const certCoin: Coin | undefined = floor?.coin ?? launched[0];

  return (
    <div className="wrap pt-[22px]">
      <section className="grid items-stretch gap-[22px] w1181:grid-cols-[minmax(0,1fr)_360px]">
        {/* hero */}
        <div className="grid items-end gap-x-3 w901:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="pb-2">
            <span className="eyebrow">Pump.fun projects</span>
            <h1 className="display mb-6 mt-3.5 text-[clamp(44px,5.4vw,78px)] uppercase leading-[0.98] tracking-[0.005em] text-balance">
              Own the <em className="hl not-italic">fees.</em>
            </h1>
            <p className="display m-0 mb-3 text-[clamp(18px,1.7vw,22px)] font-medium leading-snug">Launch a coin. Receive the Deed. Auction the rights.</p>
            <p className="muted mb-5 max-w-[500px] text-base">
              Every coin launched through Deed comes with a unique 1/1 Ownership NFT representing 100% of its creator fees. Hold it, claim the fees, or auction the rights to the highest bidder.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="gold" size="lg" href="/launch">Launch a Coin</Button>
              <Button size="lg" href="/auctions">View Live Auctions</Button>
            </div>
          </div>
          <div className="relative mx-auto mt-6 w-full max-w-[400px] w901:mt-0 w901:justify-self-end">
            {certCoin ? (
              <>
                <ChalkDoodles />
                <DeedCertificate coin={certCoin} holder={certCoin.liveAuction ? null : certCoin.deedOwner} />
              </>
            ) : (
              // No coin to show yet (nothing launched, or still loading): the hero art stands in for the certificate.
              // The moment a real coin exists, its real Deed certificate takes this slot.
              <figure className="m-0 overflow-hidden rounded-xl border-2 border-line" data-testid="hero-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/deed-hero.jpg"
                  width={1280}
                  height={853}
                  alt="Chalk drawing of an auctioneer in a hard hat raising a gavel beside a framed certificate: The Deed, 1/1, Ownership NFT (Creator Fees)."
                  className="block h-auto w-full"
                  fetchPriority="high"
                />
              </figure>
            )}
          </div>
          <div className="mt-[18px] grid grid-cols-2 gap-3 w901:col-span-2 w901:grid-cols-4">
            {[
              [String(live.length), "Live auctions"],
              [`${sol(total)} SOL`, "Total creator fees"],
              [`${feePct}%`, "Fee on completed sales"],
              [String(sold.length), "Deeds sold"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
                <b className="mono block text-[17px] font-semibold">{loaded ? v : "—"}</b>
                <span className="text-xs font-medium text-muted">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* how it works */}
        <section className="rounded-xl border border-line bg-surface px-[18px] pb-2 pt-[18px]" aria-labelledby="how">
          <span className="eyebrow" id="how">How it works</span>
          <ol className="m-0 mt-4 list-none p-0">
            {STEPS.map(([n, t, d], i) => (
              <li key={n} className="relative flex gap-3.5 pb-[18px]">
                {i < STEPS.length - 1 && <span className="absolute bottom-1 left-[19px] top-[42px] border-l-2 border-dotted border-line" aria-hidden="true" />}
                <i className="mono grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-gold/70 bg-deep text-sm font-semibold not-italic text-gold">{n}</i>
                <div>
                  <b className="display block text-[15px] font-semibold tracking-[0.08em]">{t}</b>
                  <span className="text-[13.5px] text-muted">{d}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </section>

      {/* floor + activity */}
      <section className="mt-[26px] grid gap-[22px] w1181:grid-cols-[minmax(0,1fr)_360px]">
        <FloorCard a={floor} loaded={loaded} />
        <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Live activity">
          <div className="flex items-center justify-between border-b border-stone px-4 py-3">
            <b className="display flex items-center gap-2 text-lg font-semibold uppercase tracking-[0.04em]">
              <i className="h-2 w-2 rounded-full bg-live" /> Live activity
            </b>
            <Link href="/activity" className="text-[13px] font-semibold no-underline hover:underline">View all →</Link>
          </div>
          <div>
            {activity.length ? activity.slice(0, 4).map((e) => <ActivityRow key={e.id} e={e} />) : <p className="muted m-0 p-4 text-sm">Bids, sales and launches appear here as they happen.</p>}
          </div>
        </section>
      </section>

      <Section icon={<ClockIcon size={22} />} title="Ending Soon" href="/auctions" more="View all →">
        {live.length ? <div className="grid gap-4 sm:grid-cols-2 w901:grid-cols-4">{live.slice(0, 4).map((a) => <EndingCard key={a.address} a={a} />)}</div> : <div className="empty">{loaded ? "No live auctions right now." : "Loading…"}</div>}
      </Section>

      {sold.length > 0 && (
        <Section icon={<TrophyIcon size={22} />} title="Recently Sold" href="/auctions?f=ended" more="View all →">
          <div className="grid gap-3.5 sm:grid-cols-2 w1181:grid-cols-5 w901:grid-cols-3">{sold.slice(0, 5).map((a) => <SoldCard key={a.address} a={a} />)}</div>
        </Section>
      )}

      <Section icon={<RocketIcon size={22} />} title="Launched on Deed" href="/coins" more={`View all${launched.length ? ` (${launched.length})` : ""} →`}>
        {launched.length ? <div className="grid gap-4 sm:grid-cols-2 w901:grid-cols-4">{launched.slice(0, 8).map((c) => <CoinCard key={c.mint} c={c} />)}</div> : <div className="empty">{loaded ? <>No coins launched yet. <Link className="link" href="/launch">Be the first</Link>.</> : "Loading…"}</div>}
      </Section>

      <Rules feePct={feePct} />
      <OtcBand />
    </div>
  );
}

function Section({ icon, title, href, more, children }: { icon: React.ReactNode; title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <section className="mt-[34px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="display m-0 flex items-center gap-2.5 text-[26px] font-semibold tracking-tight"><span className="text-gold-ink">{icon}</span>{title}</h2>
        <Link href={href} className="text-sm font-semibold no-underline hover:underline">{more}</Link>
      </div>
      {children}
    </section>
  );
}

function FloorCard({ a, loaded }: { a?: Auction; loaded: boolean }) {
  const c = a?.coin;
  return (
    <div className="relative flex min-w-0 flex-col justify-center overflow-hidden rounded-xl border border-ink bg-deep px-[22px] pb-5 pt-[46px] text-ink" data-testid="floor-card">
      <span className="mono absolute left-0 top-0 flex items-center gap-2 rounded-br-xl bg-gold px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-paper">
        <i className="h-2 w-2 rounded-full bg-paper" /> Live auction floor <i className="h-1 w-1 rounded-full bg-paper" /> Solana
      </span>
      {a && c ? (
        <>
          <span className="mono absolute right-[22px] top-3.5 flex items-center gap-1.5 text-xs font-semibold text-[#4ade80]"><i className="h-2 w-2 animate-pulse rounded-full bg-[#4ade80]" />Live</span>
          <div className="grid items-center gap-[22px] w1181:grid-cols-[minmax(0,0.95fr)_minmax(0,1.6fr)]">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative shrink-0">
                <Avatar coin={c} size="xl" />
                <span className="display absolute -right-2 -top-2 rounded-lg bg-gold px-1.5 text-lg font-semibold text-paper">1/1</span>
              </div>
              <div className="min-w-0">
                <h2 className="display m-0 break-words text-[30px] font-semibold leading-none">${c.symbol}</h2>
                <div className="mt-1 text-sm text-soft">{c.name}</div>
                {c.description && <p className="mb-0 mt-2 text-[13px] text-soft">{c.description.slice(0, 120)}{c.description.length > 120 ? "…" : ""}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-x-[18px] gap-y-4 w1181:border-l w1181:border-ink-3 w1181:pl-[22px] w640:grid-cols-3 w1181:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
              <Stat label="Market Cap" value={mcap(c.market.marketCapSol)} />
              <Stat label="Deed sales" value={String(c.sales)} />
              <Stat label="Creator Fees" value={`${sol(c.fees.lifetime)} SOL`} />
              <div className="col-span-full text-center w640:col-span-1 w1181:col-start-4 w1181:row-start-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-danger-soft">Auction ends in</span>
                <Countdown end={a.endTs} variant="boxes" className="justify-center" />
              </div>
              <Stat label={a.bidCount ? "Current Bid" : "Starting Bid"} value={<span className="inline-flex items-center gap-1.5 text-gold"><CoinIcon size={16} />{sol(currentBid(a), { max: 9 })} SOL</span>} />
              <Stat label="Bidders" value={String(a.bidders)} />
              <div className="col-span-full flex justify-end gap-2.5 w1181:col-span-2">
                <Button variant="gold" size="lg" className="flex-1 w1181:max-w-[240px]" href={`/auctions/${a.address}?focus=bid`}><GavelIcon size={18} /> Place a Bid</Button>
                <FavButton id={a.address} className="!h-[50px] !w-[50px] !border-2 !border-ink/50 !text-ink" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div>
          <h2 className="display m-0 mb-2 text-[32px] font-semibold">{loaded ? "The floor is open." : "Loading the floor…"}</h2>
          {loaded && (
            <>
              <p className="mb-4 max-w-[520px] text-soft">No live auctions right now. Launch a coin, or put a Deed you hold on the block, and it shows up here.</p>
              <div className="flex flex-wrap gap-2.5"><Button variant="gold" href="/launch">Launch a Coin</Button><Button href="/sell">Sell on Auction</Button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-soft">{label}</span>
      <b className="mono inline-flex items-center gap-1.5 whitespace-nowrap text-[19px] font-semibold">{value}</b>
    </div>
  );
}

function Rules({ feePct }: { feePct: number }) {
  const rules = [
    ["5:00", "Anti-sniping", "A bid in the final five minutes extends the auction by five minutes. The end time is set on-chain."],
    ["+5%", "Minimum raise", "Each new bid must beat the current bid by 5% or 0.1 SOL, whichever is greater."],
    [`${feePct}%`, "Paid only on a sale", "Listing, bidding and cancelling are free. The fee applies to completed sales only. If you are outbid, your SOL is refundable immediately."],
  ];
  return (
    <section className="mt-[34px]" aria-labelledby="rules">
      <h2 id="rules" className="display m-0 mb-3 text-[26px] font-semibold tracking-tight">Auction rules</h2>
      <div className="grid gap-[18px] w981:grid-cols-3">
        {rules.map(([b, h, p]) => (
          <div key={h} className="rounded-xl border border-line bg-surface p-[22px]">
            <b className="display inline-block rounded-lg border border-gold bg-gold-soft px-2.5 text-[34px] font-semibold leading-[1.25]">{b}</b>
            <h3 className="mb-1.5 mt-3 text-[17px] font-semibold">{h}</h3>
            <p className="muted m-0 text-sm">{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OtcBand() {
  return (
    <section className="mt-[34px] grid items-center gap-5 rounded-xl border border-ink bg-deep p-7 text-ink w901:grid-cols-[1fr_auto]" aria-labelledby="otc-h">
      <div>
        <span className="eyebrow">OTC Markets</span>
        <h2 id="otc-h" className="display mb-2 mt-3 text-[28px] font-semibold leading-tight tracking-tight">Move large positions without moving the chart.</h2>
        <p className="m-0 max-w-[640px] text-soft">Large positions can move wallet-to-wallet without affecting liquidity pools or the public chart. Escrowed, priced in SOL, settled in one transaction.</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="gold" href="/otc">Open OTC Markets</Button>
        <Button href="/otc/mine">My Offers</Button>
      </div>
    </section>
  );
}
