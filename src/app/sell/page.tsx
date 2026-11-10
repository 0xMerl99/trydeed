import type { Metadata } from "next";
import { Suspense } from "react";
import { SellView } from "@/components/sell/SellView";

export const metadata: Metadata = { title: "Sell a Deed" };

export default function Page() {
  return (
    <Suspense>
      <SellView />
    </Suspense>
  );
}
