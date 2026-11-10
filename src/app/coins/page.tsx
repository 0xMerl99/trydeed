import type { Metadata } from "next";
import { Suspense } from "react";
import { CoinsView } from "@/components/coins/CoinsView";

export const metadata: Metadata = { title: "Coins" };

export default function Page() {
  return (
    <Suspense>
      <CoinsView />
    </Suspense>
  );
}
