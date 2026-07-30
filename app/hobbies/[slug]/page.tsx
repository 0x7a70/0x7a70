import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllHobbies, getHobbyBySlug } from "@/lib/content";
import { HobbyView } from "@/components/HobbyView";

export function generateStaticParams() {
  return getAllHobbies().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const hobby = getHobbyBySlug((await params).slug);
  return hobby ? { title: hobby.title, description: hobby.description.slice(0, 155) } : {};
}

export default async function HobbyPage({ params }: { params: Promise<{ slug: string }> }) {
  const hobby = getHobbyBySlug((await params).slug);
  if (!hobby) notFound();
  return <HobbyView hobby={hobby} />;
}
