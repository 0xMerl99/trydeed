import type { Metadata } from "next";
import { OtcOfferView } from "@/components/otc/OtcOfferView";

export const metadata: Metadata = { title: "OTC offer" };

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <OtcOfferView address={address} />;
}
