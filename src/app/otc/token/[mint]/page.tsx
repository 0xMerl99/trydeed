import type { Metadata } from "next";
import { Suspense } from "react";
import { OtcTokenView } from "@/components/otc/OtcTokenView";

export const metadata: Metadata = { title: "OTC market" };

export default async function Page({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return (
    <Suspense>
      <OtcTokenView mint={mint} />
    </Suspense>
  );
}
