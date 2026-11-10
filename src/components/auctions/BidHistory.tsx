"use client";
import { Pill } from "@/components/ui/Pill";
import { TxRef } from "@/components/ui/Explorer";
import { short } from "@/lib/format";
import { sol } from "@/lib/sol";
import { when } from "@/lib/time";
import type { Auction, Bid } from "@/types";

export function BidHistory({ auction: a, history, me }: { auction: Auction; history: Bid[]; me: string | null }) {
  const rows = [...history].reverse();
  if (!rows.length) return <p className="muted m-0 text-sm">No bids yet. The first bid must be at least {sol(a.startPrice, { max: 9 })} SOL.</p>;
  return (
    <div className="tbl-wrap !rounded-none !border-0">
      <table className="tbl" data-testid="bid-history">
        <thead>
          <tr><th>Wallet</th><th>Bid amount</th><th>Time</th><th>Status</th><th>Ref</th></tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={b.ref}>
              <td className="num">{b.bidder === me ? <b>You</b> : short(b.bidder)}</td>
              <td className="num">{sol(b.amount, { max: 9 })} SOL</td>
              <td className="text-muted">{when(b.ts)}{b.extended ? " · extended +5:00" : ""}</td>
              <td>{i === 0 ? <Pill tone="gold">{a.status === "SETTLED" ? "Winner" : "Highest bid"}</Pill> : <Pill>Outbid</Pill>}</td>
              <td><TxRef value={b.ref} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
