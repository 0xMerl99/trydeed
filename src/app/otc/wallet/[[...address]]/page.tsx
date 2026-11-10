import type { Metadata } from "next";
import { OtcWalletView } from "@/components/otc/OtcWalletView";

export const metadata: Metadata = { title: "Wallet lookup" };

export default async function Page({ params }: { params: Promise<{ address?: string[] }> }) {
  const { address } = await params;
  return <OtcWalletView address={address?.[0]} />;
}
