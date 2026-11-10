import type { Metadata } from "next";
import { Suspense } from "react";
import { AuctionsView } from "@/components/auctions/AuctionsView";

export const metadata: Metadata = { title: "Live Auctions" };

export default function Page() {
  return (
    <Suspense>
      <AuctionsView />
    </Suspense>
  );
}
