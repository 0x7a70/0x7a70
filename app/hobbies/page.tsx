import type { Metadata } from "next";
import Link from "next/link";
import { HobbiesDirectory } from "@/components/HobbiesDirectory";
import { SiteHeader } from "@/components/SiteHeader";
import { getAllHobbies } from "@/lib/content";

export const metadata: Metadata = {
  title: "hobbies",
  description: "every practice currently winding through the potato patch.",
};

export default function HobbiesPage() {
  return (
    <main className="detail-page hobbies-page">
      <SiteHeader />
      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/patch">patch</Link><span>/</span><span>hobbies</span></nav>
        <header className="hobbies-heading"><p className="eyebrow">shared practices // unstable meaning</p><h1>hobbies</h1></header>
        <HobbiesDirectory hobbies={getAllHobbies()} />
      </div>
    </main>
  );
}
