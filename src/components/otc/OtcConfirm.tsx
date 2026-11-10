"use client";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { MintLine } from "@/components/ui/Explorer";
import { Modal, ModalActions } from "@/components/ui/Modal";
import type { OtcToken } from "@/types";
import { TokenLabel } from "./shared";

export interface ConfirmSpec {
  title: string;
  token: OtcToken;
  youSend: string;
  youReceive: string;
  fee: string;
  extra?: [string, string][];
  warning?: string;
  /** Plain-language settlement note. */
  note?: ReactNode;
  confirmLabel?: string;
  run: () => Promise<void>;
}

/** The last stop before anything is signed: exact assets out, assets in, fee, and what the approval does. */
export function OtcConfirm({ spec, onClose, busy }: { spec: ConfirmSpec | null; onClose: () => void; busy: boolean }) {
  return (
    <Modal open={!!spec} onClose={onClose} label={spec?.title ?? "Confirm"} locked={busy}>
      {spec && (
        <>
          <span className="eyebrow">{spec.title}</span>
          <div className="my-3"><TokenLabel t={spec.token} /></div>
          <MintLine mint={spec.token.mint} />
          <dl className="dl mt-4 text-sm">
            <dt>You send</dt><dd className="!text-base !text-danger" data-testid="confirm-send">{spec.youSend}</dd>
            <dt>You receive</dt><dd className="!text-base !text-live" data-testid="confirm-receive">{spec.youReceive}</dd>
            <dt>Platform fee</dt><dd className="!whitespace-normal">{spec.fee}</dd>
            {spec.extra?.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
          {spec.warning && <div className="warn mt-3 text-[13px]">{spec.warning}</div>}
          {spec.token.warnings.length > 0 && (
            <ul className="warn mb-0 mt-3 list-disc pl-6 text-[13px]">{spec.token.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="notice mt-3 text-[13px]">
            {spec.note ?? "Settles atomically: either both sides move in one transaction, or nothing does. No token approval or delegation is requested."} Check the amounts in your wallet before you approve.
          </div>
          <ModalActions>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="gold" disabled={busy} data-testid="otc-confirm" onClick={() => void spec.run()}>
              {busy ? "Working…" : (spec.confirmLabel ?? "Sign & send")}
            </Button>
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
