"use client";
import { useRef, useState } from "react";
import { DeedCertificate } from "@/components/deed/DeedCertificate";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { MintLine, pumpUrl } from "@/components/ui/Explorer";
import { UploadIcon } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { PageTitle } from "@/components/ui/PageTitle";
import { useToast } from "@/components/ui/Toast";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useTx } from "@/hooks/useTx";
import { loadPendingLaunches, type PendingLaunch } from "@/chain/launch";
import { useAsync } from "@/hooks/useAsync";
import { config } from "@/lib/config";
import { getService } from "@/services";
import type { LaunchResult } from "@/services/types";

const MAX_IMG = 1_500_000; // the image travels to the pinning route as base64, so keep it small
const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

interface Errors { name?: string; ticker?: string; image?: string; twitter?: string; telegram?: string }

export function LaunchView() {
  const w = useDeedWallet();
  const toast = useToast();
  const { run, busy } = useTx();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [progress, setProgress] = useState<null | { step: number; total: number; label: string; failed?: string; done?: boolean }>(null);
  const { data: readiness, error: readinessError } = useAsync(() => getService().getLaunchReadiness(), [], { refreshMs: 30_000 });
  // Until we know the Deed program is live on this network, launching is Pump.fun-only (we never lock fees to a vault nothing can pay out).
  const deedReady = readiness?.deed === true;
  // Don't let a launch start before we know which kind it is.
  const checking = !readiness && !readinessError;
  const [result, setResult] = useState<LaunchResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const sym = ticker.replace(/^\$/, "").toUpperCase();

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = "Add a coin name.";
    else if (name.trim().length > 32) e.name = "Max 32 characters.";
    if (!sym) e.ticker = "Add a ticker.";
    else if (!/^[A-Z0-9]{1,10}$/.test(sym)) e.ticker = "1–10 letters or numbers.";
    if (!image) e.image = "Upload an image for your coin.";
    for (const [k, v] of [["twitter", twitter], ["telegram", telegram]] as const) if (v.trim() && !/^https:\/\/\S+$/.test(v.trim())) e[k] = "Must start with https://";
    return e;
  };

  const onFile = (f?: File) => {
    if (!f) return;
    if (!IMG_TYPES.includes(f.type)) return setErrors((e) => ({ ...e, image: "Use a PNG, JPG, GIF or WEBP." }));
    if (f.size > MAX_IMG) return setErrors((e) => ({ ...e, image: "Image is larger than 1.5 MB." }));
    const fr = new FileReader();
    fr.onload = () => {
      setImage(String(fr.result));
      setErrors((e) => ({ ...e, image: undefined }));
    };
    fr.readAsDataURL(f);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast("Fix the highlighted fields.", "error");
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    await launchNow({ name, ticker: sym, description: desc, image, twitter, telegram }, deedReady ? "deed" : "pump");
  };

  /** Runs (or resumes) a launch. Each step is a real transaction; steps that already happened on chain are skipped. */
  const launchNow = async (input: { name: string; ticker: string; description: string; image: string | null; twitter: string; telegram: string }, mode: "deed" | "pump", resume?: string) => {
    const total = mode === "pump" ? 1 : 4;
    setProgress({ step: 0, total, label: "Connect wallet" });
    const r = await run(
      async (ctx) => {
        setProgress({ step: 1, total, label: "Starting" });
        return getService().launchCoin(ctx, { ...input, mode, resume, onStep: (s) => setProgress({ step: s.index, total: s.total, label: s.label }) });
      },
      { silent: true },
    );
    if (r) {
      setProgress({ step: total, total, label: "Done", done: true });
      setTimeout(() => {
        setProgress(null);
        setResult(r);
      }, 500);
    } else {
      setProgress((p) => ({ step: p?.step ?? 0, total, label: p?.label ?? "", failed: "The launch stopped before it finished. Whatever already confirmed on chain is kept, and you can continue from this page: nothing is repeated." }));
    }
  };
  // Coins this device launched that have no finished Deed yet (Pump.fun-only launches, or a Deed launch that was interrupted).
  const pendings: PendingLaunch[] = w.address ? loadPendingLaunches(w.address) : [];

  // ---- success
  if (result) {
    const c = result.coin;
    return (
      <div className="wrap">
        <PageTitle eyebrow="New lot" lead="Launch a" hl="coin" />
        <div className="panel mx-auto my-8 max-w-[760px] text-center" data-testid="launch-success">
          <div className="mx-auto mb-3 w-fit"><Avatar coin={c ?? { symbol: result.symbol, image: image ?? undefined }} size="xl" /></div>
          <h2 className="display m-0 mb-1.5 text-4xl font-semibold tracking-tight">Your coin is live.</h2>
          <p className="muted mx-auto mb-4 max-w-[520px] text-base">
            {c ? "You now hold its Deed, so you own its creator-fee rights." : "It is a normal Pump.fun coin and you earn its creator fees directly. You don’t have a Deed for it yet; you can create one from the Launch page when Deed is live."}
          </p>
          <div className="mx-auto mb-5 max-w-[560px] text-left"><MintLine mint={result.mint} /></div>
          {c ? (
            <>
              <div className="mx-auto mb-6 max-w-[380px] text-left"><DeedCertificate coin={c} holder={c.deedOwner} /></div>
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button href={`/coins?q=${encodeURIComponent(c.symbol)}`}>View Coin</Button>
                <Button href="/portfolio">View Deed</Button>
                <Button variant="gold" href={`/sell?coin=${c.mint}`}>Start Auction</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="gold" href={pumpUrl(result.mint)} external>Open on Pump.fun</Button>
              <Button onClick={() => setResult(null)}>Launch another</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <small id={id} className="font-medium text-danger" role="alert">{msg}</small> : null);

  return (
    <div className="wrap">
      <PageTitle eyebrow="New lot" lead="Launch a" hl="coin">
        {deedReady
          ? "Your coin goes live on Pump.fun and you receive its Deed: a unique 1/1 Ownership NFT. All of the coin’s creator fees go to a fee vault that only the Deed holder can withdraw."
          : "Your coin goes live on Pump.fun, and you earn its creator fees directly."}
      </PageTitle>

      {readiness && !readiness.deed && (
        <div className="notice mt-6" data-testid="pump-only-notice">
          <b>Deed ownership isn’t live on this network yet.</b> You can still launch your coin on Pump.fun right now: it is a normal Pump.fun coin and you keep its creator fees. You won’t get a Deed (so the fee rights can’t be auctioned) until Deed goes live; when it does, you can upgrade the coin from this page.
        </div>
      )}

      {pendings.length > 0 && (
        <div className="notice mt-6" data-testid="resume-launch">
          <b>{pendings.length === 1 ? "A coin you launched has no Deed yet." : "Coins you launched have no Deed yet."}</b>
          <ul className="m-0 mt-2 list-none p-0">
            {pendings.map((p) => (
              <li key={p.coinMint} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5">
                <span><b>${p.symbol}</b> · {p.name}</span>
                {deedReady ? (
                  <button type="button" className="link" disabled={busy} onClick={() => launchNow({ name: p.name, ticker: p.symbol, description: "", image: null, twitter: "", telegram: "" }, "deed", p.coinMint)}>{p.deedMint ? "Finish its Deed" : "Create its Deed"}</button>
                ) : (
                  <span className="muted text-[13px]">You can create its Deed once Deed is live.</span>
                )}
                <a className="link text-[13px]" href={pumpUrl(p.coinMint)} target="_blank" rel="noopener noreferrer">Pump.fun ↗</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-7 pb-12 pt-6 w981:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" id="launchWrap">
        <form ref={formRef} onSubmit={submit} noValidate className="panel" data-testid="launch-form">
          <div className="row2">
            <div className="field">
              <label htmlFor="ln">Coin name</label>
              <input id="ln" maxLength={32} placeholder="Paper Crown" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="ln-e" required />
              <Err id="ln-e" msg={errors.name} />
            </div>
            <div className="field">
              <label htmlFor="lt">Ticker</label>
              <input id="lt" maxLength={11} placeholder="CROWN" value={ticker} onChange={(e) => setTicker(e.target.value)} style={{ textTransform: "uppercase" }} aria-invalid={!!errors.ticker} aria-describedby="lt-e" required />
              <Err id="lt-e" msg={errors.ticker} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ld">Description</label>
            <textarea id="ld" rows={3} maxLength={500} placeholder="What is this coin about?" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="li">Image</label>
            <label htmlFor="li" className={`flex cursor-pointer items-center gap-3.5 rounded-lg border border-dashed bg-field p-3.5 hover:border-ink ${errors.image ? "border-danger" : "border-line"}`}>
              {image ? <Avatar coin={{ symbol: sym, image }} size="md" /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-stone text-muted"><UploadIcon size={22} /></span>}
              <span>
                <b className="block text-sm">{image ? "Change image" : "Upload image"}</b>
                <span className="text-[13px] text-muted">PNG, JPG, GIF or WEBP, max 1.5 MB. Square works best.</span>
              </span>
            </label>
            <input id="li" type="file" accept={IMG_TYPES.join(",")} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-invalid={!!errors.image} aria-describedby="li-e" />
            <Err id="li-e" msg={errors.image} />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="lx">X (Twitter)</label>
              <input id="lx" placeholder="https://x.com/…" value={twitter} onChange={(e) => setTwitter(e.target.value)} aria-invalid={!!errors.twitter} aria-describedby="lx-e" />
              <Err id="lx-e" msg={errors.twitter} />
            </div>
            <div className="field">
              <label htmlFor="ltg">Telegram</label>
              <input id="ltg" placeholder="https://t.me/…" value={telegram} onChange={(e) => setTelegram(e.target.value)} aria-invalid={!!errors.telegram} aria-describedby="ltg-e" />
              <Err id="ltg-e" msg={errors.telegram} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lw">Website</label>
            <input id="lw" value={config.siteUrl} readOnly disabled className="cursor-not-allowed !bg-paper opacity-70" />
            <small>Every coin launched on Deed links to {config.siteUrl.replace(/^https?:\/\/|\/$/g, "")}.</small>
          </div>
          <Button type="submit" variant="gold" size="lg" block disabled={busy || checking} data-testid="launch-submit">{busy ? "LAUNCHING…" : deedReady ? "LAUNCH COIN" : "LAUNCH ON PUMP.FUN"}</Button>
          <p className="muted mb-0 mt-3 text-center text-xs">
            {deedReady
              ? "Launching takes four transactions that you approve one by one: create the coin on Pump.fun, lock its creator fees to your Deed, mint the Deed, register it. Network fees and a small amount of account rent (about 0.01 SOL) apply."
              : "Launching is one transaction that you approve in your wallet: it creates the coin on Pump.fun. Network fees and Pump.fun’s account rent apply."}
          </p>
          {!w.address && <p className="muted mb-0 mt-2 text-center text-xs">You’ll be asked to connect a wallet when you launch.</p>}
        </form>

        <aside className="flex min-w-0 flex-col gap-4">
          <span className="eyebrow w-fit">Your Deed</span>
          <DeedCertificate coin={{ name: name || "Paper Crown", symbol: sym || "CROWN", image: image ?? undefined }} minted={false} />
          <div className="panel">
            <h2>What you get</h2>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[18px] text-sm text-muted">
              <li>A live Pump.fun coin anyone can trade.</li>
              {deedReady ? (
                <>
                  <li>A unique 1/1 Deed that controls 100% of its creator fees.</li>
                  <li>The option to auction those fee rights at any time.</li>
                </>
              ) : (
                <>
                  <li>All of its creator fees, paid to your wallet.</li>
                  <li>A way to turn it into a Deed (and auction the fee rights) once Deed is live.</li>
                </>
              )}
            </ul>
          </div>
        </aside>
      </div>

      <Modal open={!!progress} onClose={() => setProgress(null)} locked={!!progress && !progress.failed && !progress.done} label="Launching">
        {progress && (
          <>
            <span className="eyebrow">Launching ${sym || pendings[0]?.symbol}</span>
            <h3 className="display mb-3 mt-3 text-3xl font-semibold tracking-tight">{progress.failed ? "Launch paused" : progress.done ? "Done" : "Going live…"}</h3>
            <ol className="m-0 mb-3 flex list-none flex-col gap-2.5 p-0 text-sm">
              {(progress.total === 1 ? ["Create the coin on Pump.fun"] : ["Create the coin on Pump.fun", "Lock the creator fees to your Deed", "Mint your Deed", "Register the Deed"]).map((label, i) => {
                const n = i + 1;
                const state = progress.done || n < progress.step ? "ok" : n === progress.step ? (progress.failed ? "bad" : "on") : "todo";
                return (
                  <li key={label} className="flex items-center gap-2.5">
                    <i className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] not-italic ${state === "ok" ? "border-live bg-live-soft text-live" : state === "bad" ? "border-danger text-danger" : state === "on" ? "animate-pulse border-ink" : "border-line"}`}>{state === "ok" ? "✓" : state === "bad" ? "!" : ""}</i>
                    {label}
                  </li>
                );
              })}
            </ol>
            {progress.failed ? (
              <div className="flex items-center justify-between gap-3"><p className="m-0 text-sm text-danger">{progress.failed}</p><Button size="sm" onClick={() => setProgress(null)}>Close</Button></div>
            ) : (
              <p className="muted m-0 text-[13px]">Approve each prompt in your wallet and keep this tab open.</p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
