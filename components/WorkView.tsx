"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { corruptionStage } from "@/lib/constants";
import { hobbyActivity } from "@/lib/hobbyActivities";
import { CorruptedDescription } from "./CorruptedDescription";
import { CorruptionBar } from "./CorruptionBar";
import { RelativeTime } from "./RelativeTime";
import { SiteHeader } from "./SiteHeader";

export function WorkView({ slug }: { slug: string }) {
  const work = useQuery(api.queries.getWork, { slug });
  if (work === undefined) return <main className="detail-page"><SiteHeader /><p className="work-loading">listening for the buried work...</p></main>;
  if (work === null) return <main className="detail-page"><SiteHeader /><p className="work-loading">this work has not surfaced.</p></main>;
  const stage = corruptionStage(work.corruptionAtCreation);
  const textCorruption = Math.min(3, Math.floor(work.corruptionAtCreation / 25));

  return (
    <main className={`detail-page work-page corruption-${stage}`}>
      <SiteHeader />
      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/patch">patch</Link><span>/</span><span>works</span><span>/</span><span>{work.title}</span>
        </nav>
        <section className="work-hero">
          <div className="work-art-column">
            <div className="work-art-panel">
              <span className="frame-label">permanent artifact // {work.hobbySlug}</span>
              <pre className="work-ascii" aria-label={`ASCII artwork for ${work.title}`}>{work.webAscii}</pre>
            </div>
            <CorruptionBar value={work.corruptionAtCreation} label="corruption at creation" />
          </div>
          <div className="work-copy">
            <p className="eyebrow">created by <Link href={`/potatoes/${work.potatoSlug}`}>{work.potatoName}</Link> while <Link href={`/hobbies/${work.hobbySlug}`}>{hobbyActivity(work.hobbySlug)}</Link></p>
            <h1>{work.title}</h1>
            <CorruptedDescription text={work.insight ? `${work.description}\n\n${work.insight}` : work.description} level={textCorruption} potatoSlug={`work-${work.slug}`} />
            <p className="work-created-time">surfaced <RelativeTime timestamp={work.createdAt} /></p>
          </div>
        </section>
      </div>
    </main>
  );
}
