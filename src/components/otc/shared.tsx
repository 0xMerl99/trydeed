"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { AddressLink, TxRef } from "@/components/ui/Explorer";
import { Pill } from "@/components/ui/Pill";
import { useNow } from "@/hooks/useNow";
import { fmtUnitPrice, fmtUnits, unitPriceNumber } from "@/lib/otc";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import { ago } from "@/lib/time";
import type { OtcToken, OtcTrade } from "@/types";

/** Token amount, trimmed: 1,500 not 1,500.000000. */
export const tamt = (v: bigint, t: Pick<OtcToken, "decimals">, dp?: number) => fmtUnits(v, t.decimals, dp ?? Math.min(t.decimals, 6));
export const tsym = (t?: Pick<OtcToken, "symbol">) => (t?.symbol ? `$${t.symbol}` : "tokens");
export const stl = (l: bigint) => `${sol(l, { max: 9 })} SOL`;

/** lamports per WHOLE token -> "0.00042" */
export function perToken(lamportsPerWhole: bigint | null): string {
  if (lamportsPerWhole === null) return "—";
  const v = Number(lamportsPerWhole) / 1e9;
  return v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 4 }) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

export const refPrice = (n?: number | null) => (n ? n.toLocaleString("en-US", { maximumSignificantDigits: 4 }) : "—");

export function vsRef(pnum: number | null, ref?: number | null) {
  if (!pnum || !ref) return null;
  const d = (pnum / ref - 1) * 100;
  // inside a `.kv` this span would inherit the uppercase label style; it is a sentence, not a label
  return <span className={`block !text-xs !font-normal !normal-case !tracking-normal ${Math.abs(d) > 25 ? "!text-danger" : "!text-muted"}`}>{d >= 0 ? "+" : ""}{d.toFixed(1)}% vs reference</span>;
}
export { unitPriceNumber, fmtUnitPrice };

export function TokenLabel({ t, mint }: { t: OtcToken; mint?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar coin={{ image: t.image, symbol: t.symbol || "?" }} size="sm" />
      <div className="min-w-0">
        <b className="flex flex-wrap items-center gap-1.5">
          {t.symbol ? `$${t.symbol}` : "Unknown token"}
          {t.platformCoin && <Pill tone="gold" title="Launched on Deed">Deed</Pill>}
          {t.warnings.some((w) => /look-?alike|impersonat/i.test(w)) && <Pill tone="hot">Look-alike</Pill>}
        </b>
        <small className="block truncate text-xs text-muted">{t.name ? `${t.name} · ` : ""}{short(mint ?? t.mint)}</small>
      </div>
    </div>
  );
}

export const Side = ({ kind }: { kind: "SELL" | "BUY" }) => <span className={`font-semibold ${kind === "SELL" ? "text-danger" : "text-live"}`}>{kind === "SELL" ? "Sell" : "Buy"}</span>;

export const Who = ({ a, me }: { a?: string | null; me?: string | null }) => (a && a === me ? <b>You</b> : <AddressLink value={a} />);

export function TradesTable({ trades, token }: { trades: OtcTrade[]; token?: OtcToken }) {
  const now = useNow();
  if (!trades.length) return <p className="muted m-0 text-sm">No trades yet.</p>;
  return (
    <div className="tbl-wrap !border-0 !bg-transparent">
      <table className="tbl">
        <thead>
          <tr><th>Time</th>{!token && <th>Token</th>}<th>Side</th><th>Amount</th><th>Price (SOL)</th><th>Total</th><th>Ref</th></tr>
        </thead>
        <tbody>
          {trades.map((f) => {
            const t = token ?? f.token;
            return (
              <tr key={f.ref + f.offer}>
                <td className="text-muted">{now ? ago(f.ts, now) : ""}</td>
                {!token && <td><Link className="link mono" href={`/otc/token/${f.mint}`}>{tsym(t)}</Link></td>}
                <td>{f.kind === "SELL" ? <span className="font-semibold text-live">Taker bought</span> : <span className="font-semibold text-danger">Taker sold</span>}</td>
                <td className="num">{tamt(f.amount, t)}</td>
                <td className="num">{fmtUnitPrice(f.lamports, f.amount, t.decimals)}</td>
                <td className="num">{stl(f.lamports)}</td>
                <td><TxRef value={f.ref} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const Kpi = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="kv">
    <span>{label}</span>
    <b>{children}</b>
  </div>
);
export const KpiStrip = ({ children, cols = 5 }: { children: React.ReactNode; cols?: 3 | 5 }) => (
  <div className={`grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface [&>.kv]:border-b [&>.kv]:border-r [&>.kv]:border-stone [&>.kv]:p-4 ${cols === 5 ? "w981:grid-cols-5" : "w640:grid-cols-3"} [&>.kv:last-child]:border-r-0`} data-testid="kpis">
    {children}
  </div>
);
