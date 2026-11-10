"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { DeedCertificate } from "@/components/deed/DeedCertificate";
import { AddressLink } from "@/components/ui/Explorer";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/Icons";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorState, PageSkeleton } from "@/components/ui/States";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { useAsync } from "@/hooks/useAsync";
import { useTx } from "@/hooks/useTx";
import { AUCTION_RULES, DURATIONS, sellerProceeds, platformFee, type DurationKey } from "@/lib/auction";
import { mcap, parseSol, sol, solOrDash } from "@/lib/sol";
import { getService } from "@/services";

const LABELS = ["Select Deed", "Fee analytics", "Starting bid", "Duration", "Summary", "Start"];

export function SellView() {
  return (
    <ConnectGate eyebrow="Consign a lot">{(address) => <Wizard address={address} />}</ConnectGate>
  );
}

function Wizard({ address }: { address: string }) {
  const router = useRouter();
  const preset = useSearchParams().get("coin");
  const { refresh } = useData();
  const { run, busy } = useTx();
  const { data: pf, error, loading, reload } = useAsync(() => getService().getPortfolio(address), [address], { refreshMs: 20_000 });

  const [step, setStep] = useState(1);
  const [mint, setMint] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [dur, setDur] = useState<DurationKey>("24h");
  const [startErr, setStartErr] = useState<string | null>(null);

  // Arriving from Portfolio / Launch with ?coin= jumps straight to the fee analytics step.
  useEffect(() => {
    if (preset && pf?.assets.some((c) => c.mint === preset) && !mint) {
      setMint(preset);
      setStep(2);
    }
  }, [preset, pf, mint]);

  // The selection stops being valid if the Deed leaves this wallet (e.g. it was just listed): fall back to step 1.
  const heldMint = pf?.assets.find((c) => c.mint === mint && c.status !== "ON_AUCTION")?.mint;
  useEffect(() => {
    if (pf && step > 1 && !heldMint) setStep(1);
  }, [pf, step, heldMint]);

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !pf) return <div className="wrap pt-10"><ErrorState error={error ?? new Error("Couldn’t load your Deeds")} onRetry={reload} /></div>;

  // Only Deeds this wallet holds are ever offered. The service re-checks ownership on submit.
  const assets = pf.assets.filter((c) => c.status !== "ON_AUCTION");
  const coin = assets.find((c) => c.mint === mint);
  const startLamports = parseSol(start);

  const next = () => {
    if (step === 1 && !mint) return void setStartErr("Select a Deed first.");
    if (step === 3) {
      if (startLamports === null || startLamports < AUCTION_RULES.minStartLamports) return void setStartErr("Starting bid must be at least 0.01 SOL.");
    }
    setStartErr(null);
    setStep((s) => s + 1);
  };

  const go = async () => {
    if (!coin || startLamports === null) return;
    const r = await run((ctx) => getService().createAuction(ctx, { coinMint: coin.mint, startPrice: startLamports, duration: dur }));
    if (r) {
      await refresh();
      router.push(`/auctions/${r.auction}`);
    }
  };

  return (
    <div className="wrap">
      <PageTitle eyebrow="Consign a lot" lead="Sell on" hl="Auction">Put a Deed up for auction in six steps. The highest bidder takes over the fee rights.</PageTitle>

      <div className="steps" role="list" aria-label="Steps">
        {LABELS.map((l, i) => (
          <div key={l} role="listitem" aria-current={i + 1 === step ? "step" : undefined} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
            <b>{i + 1}</b>{l}
          </div>
        ))}
      </div>

      <div className="panel mb-5" data-testid="sell-panel">
        {step === 1 && (
          assets.length ? (
            <>
              <h2>Select Deed</h2>
              <p className="muted mb-4 mt-0 text-sm">Only Deeds held by your connected wallet are listed. Ownership is checked again when you start the auction.</p>
              <div className="grid grid-cols-1 gap-5 w640:grid-cols-2 w981:grid-cols-3" role="radiogroup" aria-label="Deeds you hold">
                {assets.map((c) => (
                  <button key={c.mint} type="button" role="radio" aria-checked={mint === c.mint} data-testid="deed-option" onClick={() => { setMint(c.mint); setStartErr(null); }}
                    className={`rounded-xl p-0 text-left outline-offset-2 ${mint === c.mint ? "ring-2 ring-gold ring-offset-2" : ""}`}>
                    <DeedCertificate coin={c} holder={c.deedOwner} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">You don’t hold any Deeds. <a className="link" href="/launch">Launch a coin</a> to get one, or win an auction.</div>
          )
        )}

        {step === 2 && coin && (
          <>
            <h2>{coin.name} · fee analytics</h2>
            <div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-live/50 bg-live-soft px-3.5 py-2.5 text-sm" data-testid="deed-verified">
              <CheckIcon size={16} className="text-live" />
              <span><b>Deed verified.</b> Your wallet holds this Deed (<AddressLink value={coin.deedMint} kind="token" />). Only the holder can list it.</span>
            </div>
            <div className="stat-grid">
              <div className="kv"><span>Lifetime fees</span><b>{sol(coin.fees.lifetime)} SOL</b></div>
              <div className="kv"><span>24h fees</span><b>{solOrDash(coin.fees.d24)}</b></div>
              <div className="kv"><span>Unclaimed</span><b data-hl>{sol(coin.fees.unclaimed)} SOL</b></div>
              <div className="kv"><span>Market cap</span><b>{mcap(coin.market.marketCapSol)}</b></div>
            </div>
            <div className="notice mt-4">
              Unclaimed fees transfer with the Deed to the winner.{" "}
              {coin.fees.claimable > 0n && (
                <button type="button" className="link" disabled={busy} onClick={async () => { if (await run((ctx) => getService().claimFees(ctx, coin.mint))) await reload(); }}>
                  Claim {sol(coin.fees.claimable)} SOL first
                </button>
              )}
              {coin.fees.claimable > 0n && " if you want to keep them."}
            </div>
          </>
        )}

        {step === 3 && coin && (
          <>
            <h2>Starting bid</h2>
            <div className="max-w-[360px]">
              <label htmlFor="sb" className="sr-only">Starting bid in SOL</label>
              <div className="inp">
                <input id="sb" inputMode="decimal" className="input !py-3 !text-lg font-semibold" placeholder="5.00" value={start} aria-invalid={!!startErr} aria-describedby="sb-h"
                  onChange={(e) => { setStart(e.target.value); setStartErr(null); }} onKeyDown={(e) => e.key === "Enter" && next()} />
                <span className="unit">SOL</span>
              </div>
            </div>
            <p id="sb-h" className={`mt-2 text-[13px] ${startErr ? "text-danger" : "text-muted"}`} role={startErr ? "alert" : undefined}>
              {startErr ?? `Lifetime fees so far: ${sol(coin.fees.lifetime)} SOL. Bidders see this number. Minimum 0.01 SOL.`}
            </p>
          </>
        )}

        {step === 4 && coin && (
          <>
            <h2>Auction duration</h2>
            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Duration">
              {DURATIONS.map((d) => (
                <button key={d.key} type="button" role="radio" aria-checked={dur === d.key} onClick={() => setDur(d.key)}
                  className={`rounded-xl border p-3.5 text-center ${dur === d.key ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink"}`}>
                  <b className="mono text-xl">{d.key}</b>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 5 && coin && startLamports !== null && (
          <>
            <h2>Summary</h2>
            <dl className="dl !gap-x-0 text-[15px]" data-testid="sell-summary">
              <dt>Coin</dt><dd>{coin.name} (${coin.symbol})</dd>
              <dt>Lifetime fees</dt><dd>{sol(coin.fees.lifetime)} SOL</dd>
              <dt>24h fees</dt><dd>{solOrDash(coin.fees.d24)}</dd>
              <dt>Unclaimed fees (go to winner)</dt><dd>{sol(coin.fees.unclaimed)} SOL</dd>
              <dt>Starting bid</dt><dd>{sol(startLamports, { max: 9 })} SOL</dd>
              <dt>Duration</dt><dd>{dur}</dd>
              <dt>Platform fee</dt><dd>{AUCTION_RULES.feeBps / 100n}% of the winning bid, completed sales only</dd>
              <dt>Listing, bids, cancelling</dt><dd>Free</dd>
              <dt className="border-t border-line pr-4 pt-2.5 text-base text-ink">You receive at the starting bid</dt>
              <dd className="border-t border-line pt-2.5 text-base">{sol(sellerProceeds(startLamports), { max: 9 })} SOL <span className="text-xs font-medium text-muted">(fee {sol(platformFee(startLamports), { max: 9 })})</span></dd>
            </dl>
            <div className="notice mt-4 text-[13px]">
              What is transferred: the Deed of ${coin.symbol}, which carries the coin’s creator-fee rights. No ${coin.symbol} tokens are sold. Starting the auction moves the Deed into escrow. You can cancel only before the first bid. After the end, anyone can settle: the winner gets the Deed, you get the SOL.
            </div>
          </>
        )}

        {assets.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-between gap-2.5">
            <Button variant="ghost" disabled={step === 1 || busy} onClick={() => { setStartErr(null); setStep((s) => s - 1); }}>Back</Button>
            {step < 5 ? (
              <Button variant="gold" onClick={next} data-testid="sell-next">Continue</Button>
            ) : (
              <Button variant="gold" size="lg" disabled={busy} onClick={go} data-testid="sell-go">{busy ? "STARTING…" : "START AUCTION"}</Button>
            )}
          </div>
        )}
        {step === 1 && startErr && <p className="mt-3 text-sm text-danger" role="alert">{startErr}</p>}
      </div>
    </div>
  );
}
