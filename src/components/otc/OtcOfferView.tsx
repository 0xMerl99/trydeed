"use client";
import Link from "next/link";
import { useState } from "react";
import { AddressLink, MintLine, TxRef } from "@/components/ui/Explorer";
import { ArrowLeftIcon } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { OfferBadge, Pill, offerStateLabel } from "@/components/ui/Pill";
import { ErrorState, PageSkeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useAsync } from "@/hooks/useAsync";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { friendlyError } from "@/lib/errors";
import { fillLamports, fmtUnitPrice, otcFee, toUnits, unitPriceNumber, unitsToInput } from "@/lib/otc";
import { short } from "@/lib/format";
import { getService } from "@/services";
import { until, when } from "@/lib/time";
import { OfferForm } from "./OfferForm";
import { OtcConfirm, type ConfirmSpec } from "./OtcConfirm";
import { useCloseOffer } from "./useCloseOffer";
import { WarningList } from "./OtcTokenView";
import { Side, TokenLabel, Who, refPrice, stl, tamt, tsym, vsRef } from "./shared";

export function OtcOfferView({ address }: { address: string }) {
  const { address: me } = useDeedWallet();
  const toast = useToast();
  const now = useNow();
  const { run, busy } = useTx();
  const { data, error, loading, reload } = useAsync(() => getService().getOtcOffer(address), [address], { refreshMs: 15_000 });
  const [fillAmt, setFillAmt] = useState<string | null>(null);
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [counter, setCounter] = useState(false);
  const wallet = useDeedWallet();
  const closer = useCloseOffer(reload);

  if (loading) return <PageSkeleton rows={2} />;
  if (error || !data) return <div className="wrap pt-10"><ErrorState error={error ?? new Error("Offer not found")} onRetry={reload} back={{ href: "/otc", label: "Back to OTC Markets" }} /></div>;

  const o = data.offer;
  const t = o.token;
  const isMaker = !!me && me === o.maker;
  const isCp = !!me && o.counterparty === me;
  const open = o.live && (o.state === "ACTIVE" || o.state === "PARTIALLY_FILLED") && (!now || o.expiresAt > now);
  const canTake = open && !isMaker && (!o.counterparty || isCp);
  const sellK = o.kind === "SELL";
  const fixed = o.minFill >= o.remaining;
  const amountText = fillAmt ?? unitsToInput(o.remaining, t.decimals);
  const amt = toUnits(amountText, t.decimals);
  const owed = amt && amt > 0n && amt <= o.remaining ? fillLamports(o.kind, amt, o.remaining, o.priceRemaining) : null;
  const pnum = unitPriceNumber(o.priceTotal, o.amountTotal, t.decimals);

  const reviewFill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amt || amt <= 0n) return void toast("Enter an amount", "error");
    if (amt > o.remaining) return void toast(`At most ${tamt(o.remaining, t)}`, "error");
    if (amt < o.minFill && amt !== o.remaining) return void toast(`Minimum fill is ${tamt(o.minFill, t)}`, "error");
    let who: string;
    try { who = await wallet.connect(); } catch (er) { return void toast(friendlyError(er), "info"); }
    if (who === o.maker) return void toast("You can’t fill your own offer", "error");
    const l = fillLamports(o.kind, amt, o.remaining, o.priceRemaining);
    const fee = otcFee(l, o.feeBps);
    setSpec({
      title: sellK ? "Confirm purchase" : "Confirm sale",
      token: t,
      youSend: sellK ? stl(l) : `${tamt(amt, t)} ${tsym(t)}`,
      youReceive: sellK ? `${tamt(amt, t)} ${tsym(t)}` : `${stl(l - fee)}`,
      fee: sellK ? `None for you. The seller pays ${stl(fee)} (${o.feeBps / 100}%)` : `${stl(fee)} (${o.feeBps / 100}%), paid by you as the token seller`,
      extra: [["Counterparty (maker)", short(o.maker)], ["Offer", short(o.address)]],
      note: "The price is checked at settlement: if the offer changes before your transaction lands, it fails and nothing moves.",
      run: async () => {
        const r = await run((ctx) => getService().fillOffer(ctx, { offer: o.address, amount: amt }));
        setSpec(null);
        if (r) { setFillAmt(null); await reload(); }
      },
    });
  };

  const close = (reason: "cancel" | "reject" | "done") => closer.ask(o, reason);

  return (
    <div className="wrap">
      <Link href={`/otc/token/${o.mint}`} className="mt-7 mb-3 inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:underline"><ArrowLeftIcon size={16} /> {t.symbol ? `$${t.symbol}` : "Token"} market</Link>
      <div className="grid gap-7 pb-10 pt-2 w981:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="panel">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <span className="eyebrow">{o.parent ? "Counteroffer" : sellK ? "Sell offer" : "Buy bid"}</span>
              <span data-testid="offer-state"><OfferBadge state={o.state} /></span>
              {o.counterparty && <Pill tone="gold">Private</Pill>}
              {isMaker && <Pill>Yours</Pill>}
            </div>
            <h1 className="display m-0 text-[clamp(24px,3.4vw,36px)] font-semibold leading-tight tracking-tight">
              {sellK ? "Selling" : "Buying"} {tamt(o.amountTotal, t)} {tsym(t)}
              <br /><span className="hl">for {stl(o.priceTotal)}</span>
            </h1>
            <div className="mt-4"><TokenLabel t={t} mint={o.mint} /></div>
            <div className="mt-3"><MintLine mint={o.mint} /></div>
          </div>
          <WarningList t={t} />
          {o.counterparty && <div className="notice"><b>Private offer.</b> Only {isCp ? <b>your wallet</b> : short(o.counterparty)} can fill or reject it.</div>}

          <div className="stat-grid" data-testid="offer-stats">
            <div className="kv"><span>Remaining</span><b>{tamt(o.remaining, t)}</b></div>
            <div className="kv"><span>Price remaining</span><b>{stl(o.priceRemaining)}</b></div>
            <div className="kv"><span>Price / token</span><b>{fmtUnitPrice(o.priceTotal, o.amountTotal, t.decimals)}</b>{vsRef(pnum, t.refPriceSol)}</div>
            <div className="kv"><span>Reference</span><b className="!text-[13px]">{refPrice(t.refPriceSol)} SOL</b></div>
          </div>

          <section className="panel">
            <h2>Fills</h2>
            {o.fills.length ? (
              <div className="tbl-wrap !border-0 !bg-transparent"><table className="tbl">
                <thead><tr><th>Taker</th><th>Amount</th><th>SOL</th><th>Fee</th><th>Time</th><th>Ref</th></tr></thead>
                <tbody>{o.fills.map((f) => (
                  <tr key={f.ref}><td><Who a={f.taker} me={me} /></td><td className="num">{tamt(f.amount, t)}</td><td className="num">{stl(f.lamports)}</td><td className="num">{stl(f.fee)}</td><td className="text-muted">{when(f.ts)}</td><td><TxRef value={f.ref} /></td></tr>
                ))}</tbody>
              </table></div>
            ) : <p className="muted m-0 text-sm">Not filled yet.</p>}
          </section>

          {data.negotiation.length > 1 && (
            <section className="panel">
              <h2>Negotiation</h2>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {data.negotiation.map((n) => (
                  <li key={n.address} className="flex gap-3 text-sm">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.address === o.address ? "bg-gold ring-2 ring-ink" : n.maker === me ? "bg-ink" : "bg-line"}`} />
                    <div>
                      <Link className="link" href={`/otc/offer/${n.address}`}>{n.parent ? "Counteroffer" : "Offer"}</Link> by <Who a={n.maker} me={me} /> · <Side kind={n.kind} /> {tamt(n.amountTotal, t)} {tsym(t)} for <b>{stl(n.priceTotal)}</b> <OfferBadge state={n.state} />
                      <span className="block text-xs text-muted">{when(n.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {canTake && (
            <form className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-[22px]" onSubmit={reviewFill} noValidate data-testid="fill-form">
              <span className="eyebrow w-fit">{sellK ? "Buy from this offer" : "Sell into this bid"}</span>
              <div className="field !mb-0">
                <label htmlFor="fa">Amount {fixed && "(all or nothing)"}</label>
                <div className="inp"><input id="fa" inputMode="decimal" autoComplete="off" value={amountText} readOnly={fixed} onChange={(e) => setFillAmt(e.target.value)} /><span className="unit">{t.symbol || "TOKEN"}</span></div>
                {!fixed && <small>Between {tamt(o.minFill, t)} and {tamt(o.remaining, t)}.</small>}
              </div>
              <div className="min-h-[18px] text-xs text-muted" aria-live="polite">{owed !== null && amt ? <>{sellK ? "You pay" : "Bid pays"} <b className="mono text-ink">{stl(owed)}</b> for {tamt(amt, t)} {tsym(t)}</> : ""}</div>
              <Button type="submit" variant="gold" size="lg" block disabled={busy} data-testid="fill-review">Review {sellK ? "purchase" : "sale"}</Button>
              <p className="muted m-0 text-xs">{sellK ? "You pay SOL and receive the tokens from escrow in the same transaction." : "You send the tokens and receive the SOL from the bid in the same transaction."} The price is checked on settlement: if the offer changes first, it fails and nothing moves.</p>
            </form>
          )}

          {counter && canTake && <OfferForm token={t} feeBps={o.feeBps} counter={{ parent: o }} />}

          <div className="panel flex flex-col gap-2.5 empty:hidden">
            {o.live && isMaker && <Button disabled={busy} onClick={() => close("cancel")} data-testid="cancel-offer">Cancel offer &amp; refund</Button>}
            {open && isCp && <Button disabled={busy} onClick={() => close("reject")} data-testid="reject-offer">Reject</Button>}
            {canTake && !counter && <Button onClick={async () => { try { await wallet.connect(); setCounter(true); } catch (er) { toast(friendlyError(er), "info"); } }} data-testid="counter-offer">Counteroffer</Button>}
            {o.live && !open && <Button variant="gold" disabled={busy} onClick={() => close("done")}>Close &amp; return assets to the maker</Button>}
            {!me && open && <Button variant="gold" onClick={wallet.openPicker}>Connect wallet to trade</Button>}
          </div>

          <div className="panel">
            <dl className="dl">
              <dt>State</dt><dd>{offerStateLabel(o.state)}</dd>
              <dt>Side</dt><dd>{sellK ? "Maker sells tokens" : "Maker buys tokens"}</dd>
              <dt>Maker</dt><dd>{isMaker ? "You" : <AddressLink value={o.maker} />}</dd>
              <dt>Counterparty</dt><dd>{o.counterparty ? (isCp ? "You" : <AddressLink value={o.counterparty} />) : "anyone"}</dd>
              <dt>Total amount</dt><dd>{tamt(o.amountTotal, t)}</dd>
              <dt>Total price</dt><dd>{stl(o.priceTotal)}</dd>
              <dt>Partial fills</dt><dd>{o.minFill >= o.amountTotal ? "no" : `min ${tamt(o.minFill, t)}`}</dd>
              <dt>Fee</dt><dd>{o.feeBps / 100}% (fixed at creation)</dd>
              <dt>Created</dt><dd>{when(o.createdAt)}</dd>
              <dt>Expires</dt><dd>{when(o.expiresAt)}{now ? ` (${until(o.expiresAt, now)})` : ""}</dd>
              {o.parent && <><dt>Counter to</dt><dd><Link className="link" href={`/otc/offer/${o.parent}`}>{short(o.parent)}</Link></dd></>}
              <dt>Offer account</dt><dd><AddressLink value={o.address} /></dd>
              <dt>Created ref</dt><dd><TxRef value={o.createdRef} /></dd>
              {o.closedRef && <><dt>Closed ref</dt><dd><TxRef value={o.closedRef} /></dd></>}
            </dl>
          </div>
        </aside>
      </div>
      <OtcConfirm spec={spec} onClose={() => setSpec(null)} busy={busy} />
      {closer.dialog}
    </div>
  );
}
