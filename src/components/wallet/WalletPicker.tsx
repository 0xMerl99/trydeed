"use client";
import { Modal } from "@/components/ui/Modal";
import { useDeedWallet } from "./DeedWallet";

/** The "Connect a wallet" dialog. */
export function WalletPicker() {
  const w = useDeedWallet();
  return (
    <Modal open={w.pickerOpen} onClose={w.closePicker} label="Connect a wallet">
      <span className="eyebrow">Connect</span>
      <h3 className="display mb-1 mt-3 text-2xl font-semibold tracking-tight">Connect a wallet</h3>
      <p className="muted mb-4 text-sm">Pick a Solana wallet. Deed never asks for your seed phrase and can’t move funds without your approval.</p>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {w.choices.map((c) => (
          <li key={c.name}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-field px-3.5 py-3 text-left transition hover:border-ink"
              onClick={() => w.choose(c.name)}
              disabled={w.connecting}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.icon} alt="" width={28} height={28} className="rounded-md" />
              <span className="flex-1 font-semibold">{c.name}</span>
              <span className={`text-xs font-semibold ${c.state === "installed" ? "text-live" : "text-muted"}`}>{c.state === "installed" ? "Detected" : "Install"}</span>
            </button>
          </li>
        ))}
        {!w.choices.length && <li className="muted rounded-lg border border-dashed border-line p-3 text-sm">No Solana wallet detected. Install Phantom or Solflare, then refresh.</li>}
      </ul>
    </Modal>
  );
}
