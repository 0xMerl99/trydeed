import type { Metadata } from "next";
import { Suspense } from "react";
import { MyOffersView } from "@/components/otc/MyOffersView";

export const metadata: Metadata = { title: "My Offers" };

export default function Page() {
  return (
    <Suspense>
      <MyOffersView />
    </Suspense>
  );
}
