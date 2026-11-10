import type { Metadata } from "next";
import { OtcMarketsView } from "@/components/otc/OtcMarketsView";

export const metadata: Metadata = { title: "OTC Markets" };

export default function Page() {
  return <OtcMarketsView />;
}
