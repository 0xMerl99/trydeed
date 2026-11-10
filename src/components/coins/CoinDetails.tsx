"use client";
import { DeedCertificate } from "@/components/deed/DeedCertificate";
import { Button } from "@/components/ui/Button";
import { AddressLink, MintLine, pumpUrl } from "@/components/ui/Explorer";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { mcap } from "@/lib/sol";
import { when } from "@/lib/time";
import type { Coin } from "@/types";

/** Token details: address, creator, Deed ownership, fee rights and key stats. */
export function CoinDetailsModal({ coin: c, onClose }: { coin: Coin; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} label={`${c.name} details`}>
      <span className="eyebrow">Coin · ${c.symbol}</span>
      <h3 className="display mb-3 mt-3 text-2xl font-semibold tracking-tight">{c.name}</h3>
      {c.description && <p className="muted mb-3 text-sm">{c.description}</p>}
      <MintLine mint={c.mint} />
      <div className="my-4">
        <DeedCertificate coin={c} holder={c.liveAuction ? null : c.deedOwner} />
        {c.liveAuction && <p className="muted mt-2 text-xs">The Deed is in escrow while the auction runs.</p>}
      </div>
      <dl className="dl">
        <dt>Creator</dt>
        <dd><AddressLink value={c.creator} /></dd>
        <dt>Deed holder</dt>
        <dd>{c.liveAuction ? "In auction escrow" : <AddressLink value={c.deedOwner} />}</dd>
        <dt>Deed mint</dt>
        <dd><AddressLink value={c.deedMint} kind="token" /></dd>
        <dt>Market cap</dt>
        <dd>{mcap(c.market.marketCapSol)}</dd>
        <dt>Completed sales</dt>
        <dd>{c.sales}</dd>
        <dt>Launched</dt>
        <dd>{when(c.launchedAt)}</dd>
      </dl>
      <ModalActions>
        <Button size="sm" href={pumpUrl(c.mint)} external>
          Pump.fun
        </Button>
        <Button size="sm" href={`/otc/token/${c.mint}`}>OTC market</Button>
        <Button size="sm" variant="gold" onClick={onClose}>
          Close
        </Button>
      </ModalActions>
    </Modal>
  );
}
