import type { Metadata } from "next";
import Link from "next/link";
import { LaunchArchive } from "@/components/LaunchArchive";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "launches",
  description: "tokens planted through 0x7a70 on X and surfaced through PotatoPad.",
};

export default function LaunchesPage() {
  return (
    <main className="detail-page launches-page">
      <SiteHeader />
      <div className="detail-shell launches-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/patch">patch</Link><span>/</span><span>launches</span></nav>
        <header className="launches-heading">
          <p className="eyebrow">x transmissions // confirmed contracts only</p>
          <h1>launches</h1>
          <p>tokens planted through 0x7a70 and surfaced on PotatoPad. failed seeds remain underground.</p>
        </header>
        <LaunchArchive />
      </div>
    </main>
  );
}
