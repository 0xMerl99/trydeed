import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/docs/DocView";
import { DOCS, getDoc } from "@/lib/docs";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  return { title: d ? `${d.title} · Docs` : "Docs", description: d?.blurb };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();
  return <DocView doc={doc} />;
}
