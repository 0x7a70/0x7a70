import { HOBBY_NAMES, POTATO_NAMES, slugify } from "./constants";
import type { PatchEvent, Potato } from "./types";

function hash(text: string) {
  return [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export const FALLBACK_POTATOES: Potato[] = POTATO_NAMES.map((name, index) => {
  const seed = hash(name);
  const hobbyCount = 2 + (seed % 3);
  return {
    name,
    slug: slugify(name),
    corruption: (seed * 17 + index * 13) % 101,
    hobbySlugs: Array.from({ length: hobbyCount }, (_, offset) =>
      slugify(HOBBY_NAMES[(seed + offset * 7) % HOBBY_NAMES.length])),
    createdAt: Date.now() - index * 1000,
    updatedAt: Date.now() - index * 1000,
  };
});

export const FALLBACK_EVENTS: PatchEvent[] = [
  {
    type: "initialization",
    potatoSlug: "0x7a70",
    potatoName: "0x7a70",
    text: "The patch opened its first eye. Twenty signals answered beneath the soil.",
    createdAt: Date.now(),
  },
];
