import type { Metadata } from "next";
import { WorkView } from "@/components/WorkView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug.replaceAll("-", " ");
  return { title: slug, description: "a permanent work recovered from the potato patch." };
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  return <WorkView slug={(await params).slug} />;
}
