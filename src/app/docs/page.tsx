import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/docs/DocView";
import { getDoc } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Deed works: the Deed, auctions, OTC trading, every page, and how the code behaves.",
};

/** /docs is the "How it works" guide; the other documents live at /docs/[slug]. */
export default function Page() {
  const doc = getDoc("how-it-works");
  if (!doc) notFound();
  return <DocView doc={doc} />;
}
