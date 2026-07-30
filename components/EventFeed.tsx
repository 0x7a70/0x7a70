"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RelativeTime } from "./RelativeTime";
import type { PatchEvent } from "@/lib/types";

export function EventFeed({ potatoSlug }: { potatoSlug?: string }) {
  const global = usePaginatedQuery(api.queries.recentEvents, {}, { initialNumItems: 12 });
  const local = usePaginatedQuery(
    api.queries.potatoEvents,
    { slug: potatoSlug || "" },
    { initialNumItems: 12 },
  );
  const source = potatoSlug ? local : global;
  const visibleEvents = (source.results as Array<PatchEvent & { _id: string }>).filter(
    (event) => event.type !== "corruption" || event.delta !== 0,
  );

  const withoutRepeatedName = (event: PatchEvent) => {
    if (potatoSlug) return event.text;
    const escapedName = event.potatoName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return event.text.replace(new RegExp(`^${escapedName}(?:'s)?\\s*`, "i"), "");
  };
  const usesPossessiveName = (event: PatchEvent) =>
    event.text.toLowerCase().startsWith(`${event.potatoName.toLowerCase()}'s `);
  const eventText = (event: PatchEvent) => {
    const text = withoutRepeatedName(event);
    if (!event.hobbySlug || (event.type !== "hobby_added" && event.type !== "hobby_removed")) return text;
    const hobbyName = event.hobbySlug.replaceAll("-", " ");
    const hobbyIndex = text.toLowerCase().indexOf(hobbyName.toLowerCase());
    if (hobbyIndex < 0) return text;
    return (
      <>
        {text.slice(0, hobbyIndex)}
        <Link className="event-hobby-link" href={`/hobbies/${event.hobbySlug}`}>
          {text.slice(hobbyIndex, hobbyIndex + hobbyName.length)}
        </Link>
        {text.slice(hobbyIndex + hobbyName.length)}
      </>
    );
  };

  return (
    <section className="event-panel" aria-labelledby="event-feed-heading">
      <div className="panel-title">
        <h2 id="event-feed-heading">{potatoSlug ? "local transmissions" : "patch events"}</h2>
        <span className="live-dot">● live</span>
      </div>
      <div className="event-list" aria-live="polite">
        {visibleEvents.map((event) => (
          <article className={`event event-${event.type}`} key={event._id}>
            <div>
              <span className="event-marker" aria-hidden="true">{event.type === "thought" ? "&gt;" : "::"}</span>
              {!potatoSlug && (
                <Link href={`/potatoes/${event.potatoSlug}`}>
                  {event.potatoName}{usesPossessiveName(event) ? "'s" : ""}
                </Link>
              )}
              <p>{eventText(event)}</p>
            </div>
            <RelativeTime timestamp={event.createdAt} />
          </article>
        ))}
        {source.status === "LoadingFirstPage" && <p className="muted">listening beneath the soil...</p>}
        {source.status === "Exhausted" && source.results.length === 0 && <p className="muted">no events have surfaced yet.</p>}
      </div>
      {source.status === "CanLoadMore" && (
        <button className="plain-button" onClick={() => source.loadMore(12)}>unearth older events</button>
      )}
    </section>
  );
}
