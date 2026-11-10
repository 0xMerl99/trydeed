"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useTx } from "@/hooks/useTx";
import { friendlyError } from "@/lib/errors";
import { looksLikeAddress } from "@/lib/format";
import { fmtUnitPrice, otcFee, toUnits, totalFromUnitPrice, unitPriceNumber, type OfferKind } from "@/lib/otc";
import { parseSol, toInputSol } from "@/lib/sol";
import { when } from "@/lib/time";
import { getService } from "@/services";
import type { OtcOffer, OtcToken } from "@/types";
import { OtcConfirm, type ConfirmSpec } from "./OtcConfirm";
import { stl, tamt, tsym } from "./shared";

export const EXPIRIES = [["3600", "1 hour"], ["21600", "6 hours"], ["86400", "24 hours"], ["259200", "3 days"], ["604800", "7 days"], ["2592000", "30 days"]] as const;

/** SOL-per-token string without exponent (the parser rejects "4.2e-7"). */
const priceStr = (v: number) => v.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");

interface Props {
  token: OtcToken;
  feeBps: number;
  /** Counteroffer to `parent`: side flips, amount/total prefilled, always private to the parent's maker. */
  counter?: { parent: OtcOffer };
  initial?: { kind?: OfferKind; counterparty?: string };
}

/** Create an OTC offer (sell tokens / buy tokens), or a counteroffer. Amount, price/token and total stay in sync. */
export function OfferForm({ token, feeBps, counter, initial }: Props) {
  const dec = token.decimals;
  const router = useRouter();
  const toast = useToast();
  const wallet = useDeedWallet();
  const { run, busy } = useTx();

  const p = counter?.parent;
  const [kind, setKind] = useState<OfferKind>(counter ? (p!.kind === "SELL" ? "BUY" : "SELL") : (initial?.kind ?? "SELL"));
  const [amount, setAmount] = useState(counter ? tamt(p!.remaining, token).replace(/,/g, "") : "");
  const [ppt, setPpt] = useState("");
  const [total, setTotal] = useState(counter ? toInputSol(p!.priceRemaining) : "");
  const [partial, setPartial] = useState(false);
  const [minFill, setMinFill] = useState("");
  const [exp, setExp] = useState("86400");
  const [priv, setPriv] = useState(!!counter || !!initial?.counterparty);
  const [cp, setCp] = useState(counter ? p!.maker : (initial?.counterparty ?? ""));
  const [err, setErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);

  const sell = kind === "SELL";
  const a = toUnits(amount, dec);
  const lamports = parseSol(total);

  // Two-way sync: editing price/token recomputes the total, editing the total recomputes price/token.
  const onAmount = (v: string, editedPpt: boolean) => {
    setAmount(v);
    const au = toUnits(v, dec);
    if (!au || au <= 0n) return;
    if (editedPpt) {
      const l = totalFromUnitPrice(au, ppt, dec);
      if (l !== null) setTotal(l > 0n ? toInputSol(l) : "");
    } else {
      const l = parseSol(total);
      const u = l ? unitPriceNumber(l, au, dec) : null;
      if (u) setPpt(priceStr(u));
    }
  };
  const [edited, setEdited] = useState<"ppt" | "total">(counter ? "total" : "ppt");
  const onPpt = (v: string) => {
    setPpt(v);
    setEdited("ppt");
    if (a && a > 0n) {
      const l = totalFromUnitPrice(a, v, dec);
      setTotal(l !== null && l > 0n ? toInputSol(l) : "");
    }
  };
  const onTotal = (v: string) => {
    setTotal(v);
    setEdited("total");
    const l = parseSol(v);
    const u = a && a > 0n && l ? unitPriceNumber(l, a, dec) : null;
    setPpt(u ? priceStr(u) : "");
  };

  const review = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const fail = (m: string) => { setErr(m); toast(m, "error"); };
    if (!a || a <= 0n) return fail(`Enter an amount (up to ${dec} decimals).`);
    if (!lamports || lamports <= 0n) return fail("Enter a price in SOL.");
    if (!counter && priv && !looksLikeAddress(cp)) return fail("Enter the counterparty wallet address.");
    let min: bigint | null = null;
    if (!counter && partial && minFill) {
      min = toUnits(minFill, dec);
      if (!min || min <= 0n || min > a) return fail("Minimum fill must be above zero and at most the amount.");
    }
    let me: string;
    try { me = await wallet.connect(); } catch (er) { return void toast(friendlyError(er), "info"); }
    if (priv && cp.trim() === me) return fail("You can’t make a private offer to yourself.");

    const fee = otcFee(lamports, feeBps);
    const expiresAt = Date.now() / 1000 + Number(exp);
    setSpec({
      title: counter ? "Confirm counteroffer" : sell ? "Confirm sell offer" : "Confirm buy bid",
      token,
      youSend: sell ? `${tamt(a, token)} ${tsym(token)}` : stl(lamports),
      youReceive: sell ? `${stl(lamports - fee)} (when filled)` : `${tamt(a, token)} ${tsym(token)} (when filled)`,
      fee: sell ? `${stl(fee)} (${feeBps / 100}%), paid by you as the token seller` : `None for you. The token seller pays ${feeBps / 100}% of the SOL price`,
      extra: [
        ["Price per token", `${fmtUnitPrice(lamports, a, dec)} SOL`],
        ["Expires", when(expiresAt)],
        priv ? ["Only fillable by", `${cp.trim().slice(0, 4)}…${cp.trim().slice(-4)}`] : ["Visibility", "Public — listed in this market"],
        ...(!counter && partial ? ([["Partial fills", min ? `yes, min ${tamt(min, token)}` : "yes"]] as [string, string][]) : []),
      ],
      note: sell
        ? "Your tokens move into an escrow account until the offer fills, you cancel it, or it expires. You can cancel any time while it is open."
        : "Your SOL is locked in the bid until it fills, you cancel it, or it expires. You can cancel any time while it is open.",
      run: async () => {
        const r = await run((ctx) =>
          getService().createOffer(ctx, { kind, mint: token.mint, amount: a, priceTotal: lamports, partial: counter ? false : partial, minFill: min, expiresInSecs: Number(exp), counterparty: priv ? cp.trim() : null, parent: counter ? counter.parent.address : null }),
        );
        setSpec(null);
        if (r) router.push(`/otc/offer/${r.offer}`);
      },
    });
  };

  const noBuy = !sell && token.transferFee;
  const note = counter
    ? kind === "BUY"
      ? "A private buy bid to the maker with your terms. Your SOL is locked until they accept, reject, you cancel, or it expires."
      : "A private sell offer to the maker with your terms. Your tokens go into escrow until they accept, reject, you cancel, or it expires."
    : null;

  return (
    <form className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-[22px]" onSubmit={review} noValidate data-testid="offer-form">
      <span className="eyebrow w-fit">{counter ? "Counteroffer" : "Make an offer"}</span>
      {note ? <p className="m-0 text-sm">{note}</p> : (
        <div className="seg" role="radiogroup" aria-label="Side">
          <button type="button" role="radio" aria-checked={sell} onClick={() => setKind("SELL")}>Sell {tsym(token)}</button>
          <button type="button" role="radio" aria-checked={!sell} onClick={() => setKind("BUY")}>Buy {tsym(token)}</button>
        </div>
      )}

      <div className="field !mb-0">
        <label htmlFor="oa">Amount</label>
        <div className="inp"><input id="oa" inputMode="decimal" placeholder="0" autoComplete="off" value={amount} onChange={(e) => onAmount(e.target.value, edited === "ppt")} /><span className="unit">{token.symbol || "TOKEN"}</span></div>
      </div>
      <div className="row2">
        <div className="field !mb-0">
          <label htmlFor="op">Price per token</label>
          <div className="inp"><input id="op" inputMode="decimal" placeholder="0.0001" autoComplete="off" value={ppt} onChange={(e) => onPpt(e.target.value)} /><span className="unit">SOL</span></div>
        </div>
        <div className="field !mb-0">
          <label htmlFor="ot">Total price</label>
          <div className="inp"><input id="ot" inputMode="decimal" placeholder="1.5" autoComplete="off" value={total} onChange={(e) => onTotal(e.target.value)} /><span className="unit">SOL</span></div>
        </div>
      </div>
      <div className="min-h-[18px] text-xs text-muted" aria-live="polite">{lamports && lamports > 0n ? <>Total <b className="mono text-ink">{stl(lamports)}</b>{a && a > 0n ? <> · fee {feeBps / 100}% ≈ {stl(otcFee(lamports, feeBps))}</> : null}</> : ""}</div>

      {!counter && (
        <>
          <label className="check"><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Allow partial fills</label>
          {partial && (
            <div className="field !mb-0">
              <label htmlFor="om">Minimum fill <span className="muted font-normal">(optional)</span></label>
              <div className="inp"><input id="om" inputMode="decimal" placeholder="any amount" value={minFill} onChange={(e) => setMinFill(e.target.value)} /><span className="unit">{token.symbol || "TOKEN"}</span></div>
            </div>
          )}
        </>
      )}

      <div className="field !mb-0">
        <label htmlFor="oe">Expires after</label>
        <select id="oe" value={exp} onChange={(e) => setExp(e.target.value)}>{EXPIRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>

      {!counter && (
        <>
          <label className="check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private offer to one wallet</label>
          {priv && (
            <div className="field !mb-0">
              <label htmlFor="oc">Counterparty wallet</label>
              <input id="oc" placeholder="Solana wallet address" spellCheck={false} autoComplete="off" value={cp} onChange={(e) => setCp(e.target.value)} />
              <small>Only this wallet can fill or reject it. Enforced by the program, not by this website.</small>
            </div>
          )}
        </>
      )}

      {noBuy && <div className="warn text-[13px]">Buy bids aren’t available for this token: its transfer fee would deliver fewer tokens than the bid asks for. You can still buy from its sell offers.</div>}
      {err && <p className="m-0 text-sm text-danger" role="alert">{err}</p>}
      <Button type="submit" variant="gold" size="lg" block disabled={busy || noBuy} data-testid="offer-review">Review {counter ? "counteroffer" : sell ? "sell offer" : "buy bid"}</Button>
      <p className="muted m-0 text-xs">
        {sell ? "Your tokens move into an escrow account until the offer fills, you cancel, or it expires." : "Your SOL is locked in the bid until it fills, you cancel, or it expires."} You can cancel any time while it is open. Fee: {feeBps / 100}% of the SOL price, paid by the token seller. No other fees except Solana network fees and refundable account rent.
      </p>
      <OtcConfirm spec={spec} onClose={() => setSpec(null)} busy={busy} />
    </form>
  );
}
