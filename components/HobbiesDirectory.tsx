"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HOBBY_ASCII } from "./HobbyView";
import { hobbyActivity } from "@/lib/hobbyActivities";
import { FALLBACK_POTATOES } from "@/lib/fallback";
import type { Potato } from "@/lib/types";

type DirectoryHobby = { title: string; slug: string };

export function HobbiesDirectory({ hobbies }: { hobbies: DirectoryHobby[] }) {
  const livePotatoes = useQuery(api.queries.listPotatoes);
  const potatoes = (livePotatoes?.length ? livePotatoes : FALLBACK_POTATOES) as Potato[];

  const countFor = (slug: string) => potatoes.filter((potato) =>
    slug === "despair" ? potato.hobbySlugs.length === 0 : potato.hobbySlugs.includes(slug),
  ).length;

  return (
    <section className="hobbies-directory" aria-label="all hobbies">
      {hobbies.map((hobby) => {
        const count = countFor(hobby.slug);
        return (
          <Link className="hobby-directory-card" href={`/hobbies/${hobby.slug}`} key={hobby.slug}>
            <h2>{hobby.title}</h2>
            <pre aria-hidden="true">{HOBBY_ASCII[hobby.slug] || HOBBY_ASCII.gardening}</pre>
            <p>{count} {count === 1 ? "potato is" : "potatoes are"} {hobbyActivity(hobby.slug)}</p>
          </Link>
        );
      })}
    </section>
  );
}
