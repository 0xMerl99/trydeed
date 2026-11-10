import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import type { OfferState } from "@/types";

type Tone = "default" | "live" | "hot" | "gold" | "ink";
export function Pill({ tone = "default", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("pill", tone === "live" && "pill-live", tone === "hot" && "pill-hot", tone === "gold" && "pill-gold", tone === "ink" && "pill-ink", className)}>
      {children}
    </span>
  );
}

const OFFER_LABEL: Record<OfferState, string> = {
  ACTIVE: "Active",
  PARTIALLY_FILLED: "Partially filled",
  FILLED: "Accepted",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};
const OFFER_TONE: Record<OfferState, Tone> = { ACTIVE: "live", PARTIALLY_FILLED: "gold", FILLED: "ink", CANCELLED: "default", REJECTED: "hot", EXPIRED: "default" };
export const offerStateLabel = (s: OfferState) => OFFER_LABEL[s];
export const OfferBadge = ({ state }: { state: OfferState }) => <Pill tone={OFFER_TONE[state]}>{OFFER_LABEL[state]}</Pill>;
