"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HOBBY_NAMES, LOOP_WORDS, POTATO_NAMES, corruptionStage, slugify } from "@/lib/constants";
import { FALLBACK_POTATOES } from "@/lib/fallback";
import { CorruptionBar } from "./CorruptionBar";
import { EventFeed } from "./EventFeed";
import { SiteHeader } from "./SiteHeader";
import { Terminal } from "./Terminal";
import { CorruptedDescription } from "./CorruptedDescription";

type StaticPotato = {
  name: string;
  slug: string;
  index: number;
  internal: string;
  external: string;
};

function profilePotatoAscii(level: number, seed: string, rootLabel: string) {
  const base = `               .---.
            .-' .-. '-.
           /   /   \\   \\
           \\   \\   /   /
            '._ '-' _.'
               \\|/
          ___..-|-..___
       .-'   .     .   '-.
      /  .               .\\
     /      [o]     [o]    \\
    |   .         ^       . |
    |          ._____.       |
    |  ..      '-----'    .  |
    |       .          ..    |
    | .          .           |
     \\    ..          .     /
      \\       .    ..      /
       '._ .          . _.'
          '--${rootLabel}--'`;
  if (level === 0) return base;

  const noise = ["+", "/", "\\", "#", "0", "?", ":", "_"];
  const seedValue = [...seed].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 17);
  return base
    .split("\n")
    .map((line, lineIndex) => {
      const shift = level >= 3 && (seedValue + lineIndex * 11) % 10 < level - 2
        ? ((seedValue + lineIndex) % 3) - 1
        : 0;
      let output = shift > 0 ? " ".repeat(shift) + line : shift < 0 ? line.slice(1) : line;
      output = [...output].map((character, characterIndex) => {
        if (character === " ") return character;
        const signal = (seedValue + lineIndex * 43 + characterIndex * 19) % 100;
        if (signal < level * 1.25) return " ";
        if (signal < level * 3.6) return noise[(signal + level + lineIndex) % noise.length];
        return character;
      }).join("");
      if (level >= 6 && (seedValue + lineIndex * 7) % 13 < level - 5) {
        output += ` ${noise[(lineIndex + level) % noise.length]}${level}`;
      }
      return output;
    })
    .join("\n");
}

export function PotatoView({ staticPotato }: { staticPotato: StaticPotato }) {
  const live = useQuery(api.queries.getPotato, { slug: staticPotato.slug });
  const fallback = FALLBACK_POTATOES.find((p) => p.slug === staticPotato.slug)!;
  const potato = live || fallback;
  const stage = corruptionStage(potato.corruption);
  const textCorruption = Math.min(3, Math.floor(potato.corruption / 25));
  const nextIndex = (staticPotato.index + 1) % POTATO_NAMES.length;
  const rootLabel = `root_${String(staticPotato.index + 1).padStart(2, "0")}`;
  const asciiCorruption = Math.min(9, Math.floor(potato.corruption / 10));
  const asciiPotato = profilePotatoAscii(asciiCorruption, potato.slug, rootLabel);
  const redShift = Math.max(0, Math.min(1, (potato.corruption - 80) / 20));
  const asciiHue = 132 * (1 - redShift);
  const asciiSaturation = 57 + 43 * redShift;
  const asciiLightness = 55 + 3 * redShift;

  return (
    <main
      className={`detail-page corruption-${stage}`}
      style={{
        "--ascii-corruption-color": `hsl(${asciiHue}deg ${asciiSaturation}% ${asciiLightness}%)`,
        "--ascii-corruption-shadow": `hsl(${asciiHue}deg ${45 + 45 * redShift}% ${18 + 7 * redShift}%)`,
      } as React.CSSProperties}
    >
      <SiteHeader />
      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/patch">patch</Link><span>/</span><span>{potato.name}</span>
        </nav>
        <section className="potato-hero">
          <div className="potato-left">
            <div className="portrait-frame">
              <span className="frame-label">specimen::{String(staticPotato.index + 1).padStart(2, "0")}</span>
              <div className="portrait-visuals">
                <pre className="profile-ascii-potato" aria-hidden="true">{asciiPotato}</pre>
              </div>
              <span className="coordinate">{rootLabel}{" // "}depth/{(staticPotato.index * 31 + 70).toString(16)}</span>
            </div>
            <CorruptionBar value={potato.corruption} className="mobile-profile-corruption" />
            <EventFeed potatoSlug={potato.slug} />
            <section className="hobby-section">
              <div className="panel-title"><h2>current hobbies</h2><span>{potato.hobbySlugs.length} active</span></div>
              <div className="hobby-links">
                {potato.hobbySlugs.map((slug: string) => (
                  <Link href={`/hobbies/${slug}`} key={slug}>
                    <span aria-hidden="true">[+]</span> {HOBBY_NAMES.find((name) => slugify(name) === slug) || slug.replaceAll("-", " ")}
                  </Link>
                ))}
              </div>
            </section>
          </div>
          <div className="potato-copy">
            <p className="eyebrow">living tuber // signal active</p>
            <h1>{potato.name}</h1>
            <CorruptionBar value={potato.corruption} className="desktop-profile-corruption" />
            <CorruptedDescription
              text={staticPotato.external}
              level={textCorruption}
              secretWord={LOOP_WORDS[staticPotato.index]}
              nextHref={`/potatoes/${slugify(POTATO_NAMES[nextIndex])}`}
              potatoSlug={potato.slug}
            />
          </div>
          <Terminal potatoSlug={potato.slug} potatoName={potato.name} />
        </section>

      </div>
    </main>
  );
}
