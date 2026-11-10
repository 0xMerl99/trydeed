"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, CopyIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import { useDeedWallet } from "./DeedWallet";

/** Header wallet control: "Connect Wallet" → once connected, a green-dot address button with a dropdown. */
export function ConnectButton({ onNavigate }: { onNavigate?: () => void }) {
  const w = useDeedWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!w.address) {
    return (
      <button type="button" className="btn btn-gold btn-sm" onClick={w.openPicker} disabled={w.connecting} data-testid="connect-wallet">
        {w.connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const item = "block w-full px-3.5 py-2 text-left text-sm font-medium text-ink no-underline hover:bg-stone";
  return (
    <div className="relative" ref={root}>
      <button type="button" className="btn btn-sm gap-2" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="wallet-menu">
        <span className="h-2 w-2 rounded-full bg-live" aria-hidden="true" />
        <span className="mono">{short(w.address)}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="border-b border-stone px-3.5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{w.walletName}</div>
            <div className="mono break-all text-xs">{w.address}</div>
            {w.balance !== null && <div className="mono mt-1.5 text-sm font-semibold">{sol(w.balance)} SOL</div>}
          </div>
          <Link role="menuitem" href="/portfolio" className={item} onClick={() => { setOpen(false); onNavigate?.(); }}>
            Portfolio
          </Link>
          <Link role="menuitem" href="/otc/mine" className={item} onClick={() => { setOpen(false); onNavigate?.(); }}>
            My Offers
          </Link>
          <button
            role="menuitem"
            type="button"
            className={`${item} flex items-center justify-between`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(w.address!);
                toast("Address copied");
              } catch {
                window.prompt("Copy address:", w.address!);
              }
              setOpen(false);
            }}
          >
            Copy address <CopyIcon size={14} />
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); w.openPicker(); }}>
            Switch wallet
          </button>
          <button role="menuitem" type="button" className={`${item} border-t border-stone text-danger`} onClick={() => { setOpen(false); void w.disconnect(); }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
