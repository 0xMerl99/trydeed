"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useToast } from "@/components/ui/Toast";
import { useAsync } from "@/hooks/useAsync";
import { looksLikeAddress, short } from "@/lib/format";
import { fmtUnits } from "@/lib/otc";
import { sol } from "@/lib/sol";
import { getService } from "@/services";
import { Kpi, KpiStrip } from "./shared";

/** See any wallet's PUBLIC token balances and send its owner a private buy bid. Holding a token is not an offer to sell it. */
export function OtcWalletView({ address }: { address?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { address: me } = useDeedWallet();
  const [q, setQ] = useState(address ?? "");
  useEffect(() => setQ(address ?? ""), [address]);
  const { data, error, loading, reload } = useAsync(() => getService().getWalletTokens(address!), [address], { enabled: !!address });
  const self = !!address && address === me;

  return (
    <div className="wrap">
      <PageTitle eyebrow="Wallet lookup" lead="See what a wallet" hl="holds">
        Look up any Solana wallet’s public token balances and send its owner a private buy bid for a token they hold.
      </PageTitle>
      <form className="mb-3.5 mt-6 flex flex-wrap gap-2.5" onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!looksLikeAddress(v)) return void toast("Enter a valid Solana wallet address", "error");
        router.push(`/otc/wallet/${v}`);
      }}>
        <div className="min-w-[240px] flex-1"><input className="input" type="search" placeholder="Solana wallet address" aria-label="Wallet address" spellCheck={false} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button type="submit" variant="gold">Look up</Button>
        {me && !self && <Button href={`/otc/wallet/${me}`}>My wallet</Button>}
      </form>
      <div className="notice mb-5"><b>Holding a token is not an offer to sell it.</b> These are public balances read from Solana. A private bid only notifies the owner in this app; your SOL stays locked in your own bid until they accept, reject, you cancel, or it expires.</div>

      {address && (loading ? <Skeleton h={200} /> : error || !data ? <ErrorState error={error ?? new Error("Couldn’t read this wallet")} onRetry={reload} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2"><span className="pill">Read from Solana</span></div>
          <div className="mb-4"><KpiStrip cols={3}>
            <Kpi label="Wallet">{self ? "You" : short(data.wallet)}</Kpi>
            <Kpi label="SOL">{data.sol !== null ? sol(data.sol) : "—"}</Kpi>
            <Kpi label="Tokens">{data.tokens.length}</Kpi>
          </KpiStrip></div>
          {data.tokens.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Token</th><th>Amount</th><th /></tr></thead>
              <tbody>{data.tokens.map((t) => (
                <tr key={t.mint}>
                  <td><div className="flex items-center gap-2.5"><Avatar coin={{ symbol: t.symbol, image: t.image }} size="sm" /><div><b>{t.symbol ? `$${t.symbol}` : "Unknown token"}</b><div className="mono text-xs text-muted">{short(t.mint)}</div></div></div></td>
                  <td className="num">{fmtUnits(t.amount, t.decimals)}</td>
                  <td className="right whitespace-nowrap">
                    {t.supported === false ? <span className="text-xs text-muted">not supported</span> : self
                      ? <Button size="sm" href={`/otc/token/${t.mint}?kind=sell`}>Sell OTC</Button>
                      : <Button size="sm" variant="gold" href={`/otc/token/${t.mint}?kind=buy&cp=${data.wallet}`}>Make OTC offer</Button>}{" "}
                    <Button size="sm" variant="ghost" href={`/otc/token/${t.mint}`}>Market</Button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState>This wallet holds no tokens.</EmptyState>}
          {data.truncated && <p className="muted mt-2 text-xs">Showing the 200 largest holdings.</p>}
        </>
      ))}
    </div>
  );
}
