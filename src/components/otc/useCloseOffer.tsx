"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useTx } from "@/hooks/useTx";
import { friendlyError } from "@/lib/errors";
import { getService } from "@/services";
import type { OtcOffer } from "@/types";
import { OtcConfirm, type ConfirmSpec } from "./OtcConfirm";
import { stl, tamt, tsym } from "./shared";

/** Cancel / reject / close with a confirmation dialog. Used by the offer page and by My Offers. */
export function useCloseOffer(onDone: () => void | Promise<void>) {
  const wallet = useDeedWallet();
  const toast = useToast();
  const { run, busy } = useTx();
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);

  const ask = async (o: OtcOffer, reason: "cancel" | "reject" | "done") => {
    let me: string;
    try { me = await wallet.connect(); } catch (er) { return void toast(friendlyError(er), "info"); }
    const t = o.token;
    const to = o.maker === me ? "you" : "the maker";
    const back = o.kind === "SELL" ? `${tamt(o.remaining, t)} ${tsym(t)} in escrow go back to ${to}` : `${stl(o.priceRemaining)} locked in the bid go back to ${to}`;
    setSpec({
      title: { cancel: "Cancel this offer?", reject: "Reject this private offer?", done: "Close this offer?" }[reason],
      token: t,
      youSend: "—",
      youReceive: reason === "reject" ? "The maker gets everything back" : back,
      fee: "None. You pay only the network fee.",
      note: `${back}. The account rent goes back to the maker too.`,
      confirmLabel: { cancel: "Cancel offer", reject: "Reject offer", done: "Close offer" }[reason],
      run: async () => {
        const r = await run((ctx) => getService().closeOffer(ctx, o.address, reason));
        setSpec(null);
        if (r) await onDone();
      },
    });
  };

  return { ask, busy, dialog: <OtcConfirm spec={spec} onClose={() => setSpec(null)} busy={busy} /> };
}
