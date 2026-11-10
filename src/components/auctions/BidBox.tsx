"use client";
import { useEffect, useRef, useState } from "react";
import { AddressLink } from "@/components/ui/Explorer";
import { Button } from "@/components/ui/Button";
import { useSearchParams } from "next/navigation";
import { Countdown } from "@/components/ui/Countdown";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useNow, nowNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { auctionPhase, currentBid, minIncrement, minNextBid, platformFee, quickBids, validateBid } from "@/lib/auction";
import { short } from "@/lib/format";
import { parseSol, sol, toInputSol } from "@/lib/sol";
import { when } from "@/lib/time";
import { getService } from "@/services";
import type { AuctionDetail } from "@/types";

/** The sticky right-hand panel: current bid, minimum next bid, countdown, bid form, escrow explainer, auction facts. */
export function BidBox({ detail, onChanged }: { detail: AuctionDetail; onChanged: () => Promise<void> }) {
  const a = detail.auction;
  const c = a.coin;
  const w = useDeedWallet();
  const me = w.address;
  const now = useNow();
  const { run, busy } = useTx();
  const focus = useSearchParams().get("focus") === "bid";

  const phase = now ? auctionPhase(a, now) : "LIVE";
  const minNext = minNextBid(a);
  const [text, setText] = useState(toInputSol(minNext));
  const [confirm, setConfirm] = useState<bigint | null>(null);
  const touched = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // Someone outbid while the user was looking: follow the new minimum unless they have started typing.
  useEffect(() => {
    if (!touched.current) setText(toInputSol(minNext));
  }, [minNext]);
  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const amount = parseSol(text);
  const check = validateBid(a, amount, now || nowNow(), me);
  const isSeller = !!me && me === a.seller;
  const isHighest = !!me && me === a.highestBidder;
  const lastExtended = detail.history.length > 0 && detail.history[detail.history.length - 1].extended && phase === "LIVE";
  const inline = text.trim() !== "" && !check.ok && check.code !== "NOT_LIVE" ? check.message : null;
  const svc = getService();

  const doBid = async (amt: bigint) => {
    const r = await run((ctx) => svc.placeBid(ctx, { auction: a.address, amount: amt }));
    if (r) {
      touched.current = false;
      await onChanged();
    }
  };
  const act = async (fn: Parameters<typeof run>[0]) => {
    if (await run(fn)) await onChanged();
  };

  const bigBid = (
    <div className="mono text-[34px] font-semibold leading-none w640:text-[42px]" data-testid="current-bid">
      {sol(currentBid(a), { max: 9 })} <span className="text-lg font-medium text-muted">SOL</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-[22px]" data-testid="bid-box">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{a.bidCount ? (phase === "LIVE" ? "Current bid" : "Final bid") : "Starting bid"}</span>
        {phase === "LIVE" ? <Pill tone="live">Live</Pill> : <Pill tone="hot">{phase === "ENDED" ? "Ended" : phase}</Pill>}
      </div>
      {bigBid}

      {phase === "LIVE" && (
        <>
          <div className="flex flex-wrap justify-between gap-3">
            <div className="kv"><span>Minimum next bid</span><b data-testid="min-next">{sol(minNext, { max: 9 })} SOL</b></div>
            <div className="kv text-right"><span>Time left</span><b><Countdown end={a.endTs} /></b></div>
          </div>
          {lastExtended && <div className="notice !py-2 text-[13px]" role="status" data-testid="extended-banner">⏱ Bid placed near closing. Auction extended by five minutes.</div>}

          <div>
            <label htmlFor="bid" className="sr-only">Your bid in SOL</label>
            <div className="flex gap-2.5">
              <div className="inp min-w-0 flex-1">
                <input
                  id="bid"
                  ref={input}
                  inputMode="decimal"
                  autoComplete="off"
                  className="input !py-3 !text-lg font-semibold"
                  value={text}
                  aria-invalid={!!inline}
                  aria-describedby="bid-hint"
                  onChange={(e) => { touched.current = true; setText(e.target.value); }}
                />
                <span className="unit">SOL</span>
              </div>
              <Button
                variant="gold"
                disabled={busy || isSeller || isHighest || !check.ok}
                onClick={() => (amount !== null ? setConfirm(amount) : undefined)}
                data-testid="place-bid"
              >
                Place Bid
              </Button>
            </div>
            <p id="bid-hint" className={`mt-1.5 min-h-[18px] text-[13px] ${inline ? "text-danger" : "text-muted"}`} role={inline ? "alert" : undefined}>
              {inline ?? `At least ${sol(minNext, { max: 9 })} SOL: the current bid plus ${a.bidCount ? sol(minIncrement(a.highestBid), { max: 9 }) : "the starting price"}${a.bidCount ? " (5% or 0.1 SOL, whichever is greater)" : ""}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Quick bids">
            {quickBids(minNext).map((v) => (
              <button key={v.toString()} type="button" className="chip" onClick={() => { touched.current = true; setText(toInputSol(v)); }}>
                {sol(v, { max: 9 })}
              </button>
            ))}
          </div>

          {isSeller && <p className="muted m-0 text-[13px]">This is your auction. You can’t bid on it. {a.bidCount ? "It can’t be cancelled after the first bid." : <>Before the first bid you can <button type="button" className="link" disabled={busy} onClick={() => act((ctx) => svc.cancelAuction(ctx, a.address))}>cancel it</button>.</>}</p>}
          {isHighest && <p className="m-0 text-[13px]"><b>You hold the highest bid.</b> You can bid again once someone outbids you.</p>}
          <p className="muted m-0 text-xs">
            Your SOL is held by the auction program when you bid. If someone outbids you it is returned to your wallet automatically, in the same transaction as their bid. A bid in the last five minutes extends the auction by five minutes.
          </p>
        </>
      )}

      {phase === "ENDED" && (
        <>
          <div className="notice">
            The hammer fell. {a.bidCount ? <>Winner: <b>{a.highestBidder === me ? "you" : short(a.highestBidder)}</b> at {sol(a.highestBid, { max: 9 })} SOL.</> : "No bids: the Deed goes back to the seller."} Anyone can settle it now.
          </div>
          <Button variant="gold" size="lg" disabled={busy} onClick={() => act((ctx) => svc.settleAuction(ctx, a.address))} data-testid="settle">Settle Auction</Button>
        </>
      )}

      {(phase === "SETTLED" || phase === "CANCELLED" || phase === "UNSOLD") && (
        <>
          <div className="text-center"><span className="mono inline-block rounded border-2 border-ink px-3 py-1 text-xl font-semibold tracking-[0.1em]">{phase === "SETTLED" ? "SOLD" : phase === "CANCELLED" ? "CANCELLED" : "NO SALE"}</span></div>
          <p className="m-0 text-center">
            {phase === "SETTLED" ? <>Sold to <b>{a.highestBidder === me ? "you" : short(a.highestBidder)}</b> for <b>{sol(a.highestBid, { max: 9 })} SOL</b>. The Deed and its fee rights moved to the winner.</> : phase === "CANCELLED" ? "The seller cancelled before any bids." : "No bids. The Deed went back to the seller."}
          </p>
        </>
      )}

      <dl className="dl border-t border-stone pt-4">
        <dt>Seller</dt><dd>{isSeller ? "You" : <AddressLink value={a.seller} />}</dd>
        <dt>Highest bidder</dt><dd>{a.highestBidder ? (a.highestBidder === me ? "You" : <AddressLink value={a.highestBidder} />) : "None yet"}</dd>
        <dt>Deed owner</dt>
        <dd>{phase === "LIVE" || phase === "ENDED" ? "In auction escrow" : <AddressLink value={c.deedOwner} />}</dd>
        <dt>Deed (NFT)</dt><dd><AddressLink value={a.deedMint} kind="token" /></dd>
        <dt>Coin mint</dt><dd><AddressLink value={a.coinMint} kind="token" /></dd>
        <dt>Auction</dt><dd><AddressLink value={a.address} /></dd>
        <dt>Auction start</dt><dd>{when(a.startTs)}</dd>
        <dt>Auction end</dt><dd data-testid="end-time">{when(a.endTs)}</dd>
        <dt>Platform fee</dt><dd className="!whitespace-normal">{a.feeBps / 100}% of the sale, paid by the seller — completed sales only</dd>
      </dl>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} label="Confirm bid">
        {confirm !== null && (
          <>
            <span className="eyebrow">Confirm bid</span>
            <h3 className="display mb-0 mt-3 text-4xl font-semibold tracking-tight">{sol(confirm, { max: 9 })} SOL</h3>
            <p className="muted mb-3.5 mt-1 text-sm">for the Deed of <b className="text-ink">{c.name} (${c.symbol})</b></p>
            <div className="notice mb-3 text-[13px]">
              You are buying the <b>creator-fee rights</b>, not tokens. {sol(confirm, { max: 9 })} SOL is held by the auction program now. If you win, you receive the Deed plus the fees unclaimed so far ({sol(c.fees.unclaimed)} SOL). If you are outbid, the SOL is returned to your wallet automatically in the same transaction as the higher bid.
            </div>
            <dl className="dl mb-1 text-[13px]">
              <dt>If you win, the seller receives</dt><dd>{sol(confirm - platformFee(confirm), { max: 9 })} SOL</dd>
              <dt>Platform fee (seller pays)</dt><dd>{sol(platformFee(confirm), { max: 9 })} SOL</dd>
            </dl>
            <ModalActions>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="gold" disabled={busy} data-testid="confirm-bid" onClick={() => { const v = confirm; setConfirm(null); void doBid(v); }}>
                Sign & Bid
              </Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </div>
  );
}
