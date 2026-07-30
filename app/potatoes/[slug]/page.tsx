import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPotatoes, getPotatoBySlug } from "@/lib/content";
import { PotatoView } from "@/components/PotatoView";

export function generateStaticParams() {
  return getAllPotatoes().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const potato = getPotatoBySlug((await params).slug);
  return potato ? { title: potato.name, description: potato.external.slice(0, 155) } : {};
}

export default async function PotatoPage({ params }: { params: Promise<{ slug: string }> }) {
  const potato = getPotatoBySlug((await params).slug);
  if (!potato) notFound();
  return <PotatoView staticPotato={potato} />;
}
