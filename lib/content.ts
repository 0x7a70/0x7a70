import "server-only";
import fs from "node:fs";
import path from "node:path";
import { HOBBY_NAMES, POTATO_NAMES, slugify } from "./constants";

const root = path.join(process.cwd(), "content");

function repair(value: string) {
  return value
    .replaceAll("â€™", "’")
    .replaceAll("â€œ", "“")
    .replaceAll("â€", "”")
    .replaceAll("â€“", "–")
    .replaceAll("naÃ¯ve", "naïve");
}

function read(relative: string) {
  return repair(fs.readFileSync(path.join(root, relative), "utf8").trim());
}

export function getPersonality(name: string) {
  const raw = read(path.join("personalities", `${name}.txt`));
  const [internalPart, externalPart = ""] = raw.split("EXTERNAL-FACING DESCRIPTION");
  return {
    internal: internalPart.replace(/INTERNAL DESCRIPTION\s*=+/m, "").trim(),
    external: externalPart.replace(/^=+\s*/m, "").trim(),
  };
}

export function getPotatoBySlug(slug: string) {
  const index = POTATO_NAMES.findIndex((name) => slugify(name) === slug);
  if (index < 0) return null;
  const name = POTATO_NAMES[index];
  return { name, slug, index, ...getPersonality(name) };
}

export function getHobbyBySlug(slug: string) {
  if (slug === "despair") {
    return { title: "despair", slug, description: read(path.join("hobbies", "Despair.txt")) };
  }
  const title = HOBBY_NAMES.find((name) => slugify(name) === slug);
  if (!title) return null;
  return { title, slug, description: read(path.join("hobbies", `${title}.txt`)) };
}

export function getAllPotatoes() {
  return POTATO_NAMES.map((name) => ({ name, slug: slugify(name) }));
}

export function getAllHobbies() {
  return [
    ...HOBBY_NAMES.map((title) => ({ title, slug: slugify(title) })),
    { title: "despair", slug: "despair" },
  ];
}
