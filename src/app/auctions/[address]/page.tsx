import type { Metadata } from "next";
import { Suspense } from "react";
import { AuctionDetailView } from "@/components/auctions/AuctionDetailView";

export const metadata: Metadata = { title: "Auction" };

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <Suspense>
      <AuctionDetailView address={address} />
    </Suspense>
  );
}
