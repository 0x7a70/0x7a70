import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { WorkArchive } from "@/components/WorkArchive";

export const metadata: Metadata = {
  title: "works",
  description: "every artifact, observation, and strange result recovered from the potato patch.",
};

export default function WorksPage() {
  return (
    <main className="detail-page works-page">
      <SiteHeader />
      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/patch">patch</Link><span>/</span><span>works</span></nav>
        <header className="works-heading"><p className="eyebrow">artifact ledger // nothing returns to the soil</p><h1>works</h1></header>
        <WorkArchive scope="global" />
      </div>
    </main>
  );
}
