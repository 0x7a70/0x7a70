"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Work } from "@/lib/types";
import { RelativeTime } from "./RelativeTime";

export function WorkArchive({ scope, slug = "" }: { scope: "potato" | "hobby" | "global"; slug?: string }) {
  const potatoWorks = usePaginatedQuery(api.queries.potatoWorks, { slug }, { initialNumItems: 8 });
  const hobbyWorks = usePaginatedQuery(api.queries.hobbyWorks, { slug }, { initialNumItems: 8 });
  const globalWorks = usePaginatedQuery(api.queries.recentWorks, {}, { initialNumItems: 12 });
  const source = scope === "potato" ? potatoWorks : scope === "hobby" ? hobbyWorks : globalWorks;
  const works = source.results as Array<Work & { _id: string }>;

  return (
    <section className="works-archive">
      <div className="panel-title"><h2>{scope === "global" ? "all works" : <Link href="/works">{scope === "potato" ? "works" : "permanent works"}</Link>}</h2><span>{works.length}{source.status === "Exhausted" ? " recovered" : "+ recovered"}</span></div>
      {works.length ? (
        <div className="work-list">
          {works.map((work) => (
            <article className="work-entry" key={work._id}>
              <div className="work-entry-copy">
                <Link className="work-title-link" href={`/works/${work.slug}`}>{work.title}</Link>
                <p>
                  {scope === "hobby" ? <><Link href={`/potatoes/${work.potatoSlug}`}>{work.potatoName}</Link><span>{" // "}</span></> : null}
                  {scope === "potato" ? <><Link href={`/hobbies/${work.hobbySlug}`}>{work.hobbyTitle}</Link><span>{" // "}</span></> : null}
                  {scope === "global" ? <><Link href={`/potatoes/${work.potatoSlug}`}>{work.potatoName}</Link><span>{" // "}</span><Link href={`/hobbies/${work.hobbySlug}`}>{work.hobbyTitle}</Link><span>{" // "}</span></> : null}
                  {Math.round(work.corruptionAtCreation)}% corruption
                </p>
                {scope === "global" && <p className="work-entry-description">{work.description}</p>}
              </div>
              {scope === "global" ? (
                <div className="work-entry-art">
                  <RelativeTime timestamp={work.createdAt} />
                  <Link href={`/works/${work.slug}`} aria-label={`view ${work.title}`}>
                    <pre className="work-archive-ascii" aria-hidden="true"><code>{work.webAscii}</code></pre>
                  </Link>
                </div>
              ) : <RelativeTime timestamp={work.createdAt} />}
            </article>
          ))}
          {source.status === "CanLoadMore" && (
            <button className="plain-button work-load-more" onClick={() => source.loadMore(8)}>unearth older works</button>
          )}
        </div>
      ) : <p className="muted works-empty">no work has surfaced here yet.</p>}
    </section>
  );
}
