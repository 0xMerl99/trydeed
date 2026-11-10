import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import type { Coin } from "@/types";

type CertCoin = Pick<Coin, "name" | "symbol" | "image"> & Partial<Pick<Coin, "deedMint" | "deedOwner" | "fees">>;

/**
 * The Deed rendered as the ownership document it is: thin ink border, a gold inner rule, a seal.
 * Shows only what is known — a not-yet-minted Deed (launch preview) says "pending", never a fake address.
 */
export function DeedCertificate({ coin, footer, holder, minted = true }: { coin: CertCoin; footer?: ReactNode; holder?: string | null; minted?: boolean }) {
  const lifetime = coin.fees?.lifetime ?? 0n;
  const unclaimed = coin.fees?.unclaimed ?? 0n;
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink bg-surface p-5 text-ink" data-testid="deed-certificate">
      <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-gold/70" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <span className="mono inline-block rounded-sm border border-gold/60 bg-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">Deed · 1/1 Ownership NFT</span>
          <Seal />
        </div>
        <div className="mt-4 flex items-center gap-3 pr-10">
          <Avatar coin={coin} size="md" />
          <div className="min-w-0">
            <p className="display m-0 truncate text-[22px] font-semibold leading-tight tracking-tight">{coin.name || "Your coin"}</p>
            <span className="mono text-xs text-muted">${coin.symbol || "TICKER"}</span>
          </div>
        </div>
        <p className="mono mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-ink">Controls 100% of creator fees</p>
        <dl className="dl mt-2 rounded-lg border border-stone bg-paper px-3 py-2.5">
          <dt>Lifetime fees</dt>
          <dd>{sol(lifetime)} SOL</dd>
          <dt>Unclaimed</dt>
          <dd><span data-hl>{sol(unclaimed)} SOL</span></dd>
          <dt>Deed</dt>
          <dd>{minted && coin.deedMint ? short(coin.deedMint) : "Pending launch"}</dd>
          {holder !== undefined && (
            <>
              <dt>Holder</dt>
              <dd>{holder ? short(holder) : "Auction escrow"}</dd>
            </>
          )}
        </dl>
        {footer && <div className="mt-4 flex flex-wrap gap-2">{footer}</div>}
      </div>
    </div>
  );
}

function Seal() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" className="absolute right-0 top-0 -rotate-12 translate-x-1 translate-y-3">
      <circle cx="26" cy="26" r="23" fill="#D4A017" />
      <circle cx="26" cy="26" r="19" fill="none" stroke="#0A0A0A" strokeWidth="1" />
      <circle cx="26" cy="26" r="16.5" fill="none" stroke="#0A0A0A" strokeWidth="0.6" strokeDasharray="1.6 2" />
      <text x="26" y="24" textAnchor="middle" fontSize="8" fontWeight="700" fill="#0A0A0A" style={{ fontFamily: "var(--font-outfit), sans-serif", letterSpacing: "0.12em" }}>
        FEE
      </text>
      <text x="26" y="33" textAnchor="middle" fontSize="7" fontWeight="600" fill="#0A0A0A" style={{ fontFamily: "var(--font-outfit), sans-serif", letterSpacing: "0.1em" }}>
        RIGHTS
      </text>
    </svg>
  );
}
