"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FALLBACK_POTATOES } from "@/lib/fallback";
import { corruptionStage, potatoImage } from "@/lib/constants";
import type { Potato } from "@/lib/types";
import { CorruptedDescription } from "./CorruptedDescription";
import { SiteHeader } from "./SiteHeader";

const HOBBY_ASCII: Record<string, string> = {
  "amateur-archaeology": `       __
   ___/ /___
  / _  / __ \\
 / /_/ / /_/ /
 \\__,_/\\____/
    /\\
 __/  \\__    _
|  _  _  | _/ \\_
|_/ \\/ \\_| \\___/`,
  baking: `      ( (
       ) )
    .--------.
   /  .----.  \\
  |  /      \\  |
  | |  loaf  | |
   \\ \\______/ /
    '--------'
      |____|`,
  birdwatching: `       __
  ____/o \\_
 /  _     _>
 \\_/ \\___/
      \\
   ___O___
  /  / \\  \\
     ||`,
  "building-small-machines": `   .----------.
   |  o    O  |
 --+---+------+--
   | (###)    |
   |  /_\\  o  |
   '----------'
      /  \\
   ==    ==`,
  chess: `      .-.
     /___\\
     |___|
    /_____\\
      | |
    __| |__
   /_______\\
  [][##][][]
   \\_______/`,
  coding: ` .----------------.
 | > root.run()   |
 | 0101  ::  110 |
 | if (soil) {   |
 |   grow();     |
 | }             |
 '----------------'
      _| |_`,
  "collecting-strange-objects": `     .--------.
    /  ?  *   /|
   / o  []   / |
  +---------+  |
  |  @  {}  |  +
  | <>   !  | /
  |_________|/
    keep/all`,
  gardening: `       \\|/
     -- * --
       /|\\
        |
    \\   |   /
     \\  |  /
  ____\\_|_/____
  ....\\|/.....
      / \\`,
  journaling: `    __________
   /         /|
  /  root_08/ |
 /_________/  |
 | dear soil| |
 |  ...    | /
 |_________|/
      /|
     /_|`,
  mapmaking: `   .------------.
  /  ^     x   /|
 / ~~~  /\\   / |
+------------+  |
|  .--->  o  |  +
| /  trail   | /
|____________|/
      N ^`,
  meditation: `       _____
     .'     '.
    /  -   -  \\
   |     _     |
    \\  _____  /
     '.___.'
      _/|\\_
   __/  |  \\__
      breathe`,
  "metal-detecting": `      ______
     / ____ \\
    /_/    \\_\\
       ||
       ||
       ||____
       |    \\
    ___|_____)__
   /  x  x  x   \\`,
  "mushroom-hunting": `       _____
    .-'     '-.
   /  .  o  .  \\
  /_____________\\
      /  |  \\
     /   |   \\
    /____|____\\
   . . . | . . .
      spoor`,
  painting: `       /\\
      /  \\__
     /      \\>
    / brush/
   /______/
      ||
  .----------.
  | ** ~~ ++ |
  |  canvas  |
  '----------'`,
  photography: `      __||__
   .----------.
   |  __      |
   | /  \\  [] |
   | |()|     |
   | \\__/     |
   '----------'
      /____\\
     click`,
  "puzzle-solving": `   .---.---.---.
   |   |   | ? |
   +---+   +---+
   |   |       |
   +   +---+---+
   |       |   |
   '---+---+---'
       [fit]`,
  "radio-listening": `       /|
      / |
  .--/--+-----.
  | .------.  |
  | | 107.7|  |
  | '------'  |
  |  o   (()) |
  '-----------'
   ~~~ signal`,
  stargazing: `   *       .      *
       .-.
  .   (   )   .
       '-'
     *     *
        /\\
       /  \\
      /____\\
       ||||
     sky/root`,
  storytelling: `      _______
    .'       '.
   / once below\\
  | the roots...|
   \\           /
    '.__   __.'
        \\ /
     ____V____
    /________/`,
  woodworking: `       |||||||
      /_______\\
  ====[_______]====
      /  saw  /
     /_/\\/\\_/
   ______________
  | grain/////// |
  |______________|`,
};

export function HobbyView({ hobby }: { hobby: { title: string; slug: string; description: string } }) {
  const live = useQuery(api.queries.getHobby, { slug: hobby.slug });
  const potatoes: Potato[] = (live?.potatoes || FALLBACK_POTATOES.filter((potato) => potato.hobbySlugs.includes(hobby.slug))) as Potato[];
  const average = potatoes.length ? potatoes.reduce((sum, potato) => sum + potato.corruption, 0) / potatoes.length : 0;
  const textCorruption = Math.min(3, Math.floor(average / 25));

  return (
    <main className={`detail-page hobby-page corruption-${corruptionStage(average)}`}>
      <SiteHeader />
      <div className="detail-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/patch">patch</Link><span>/</span><span>hobbies</span><span>/</span><span>{hobby.title}</span>
        </nav>
        <section className="hobby-hero">
          <div className="hobby-signal-column">
            <div className="hobby-symbol" aria-hidden="true">
              <span>{HOBBY_ASCII[hobby.slug] || HOBBY_ASCII.gardening}</span>
            </div>
            <p className="hobby-average-corruption">{Math.round(average)}% user corruption</p>
          </div>
          <div>
            <p className="eyebrow">patch activity // shared practice</p>
            <h1>{hobby.title}</h1>
            <CorruptedDescription
              text={hobby.description}
              level={textCorruption}
              potatoSlug={`hobby-${hobby.slug}`}
            />
          </div>
        </section>
        <section className="hobby-members">
          <div className="panel-title"><h2>potatoes practicing</h2><span>{potatoes.length} connected</span></div>
          {potatoes.length ? (
            <div className="member-grid">
              {potatoes.map((potato) => (
                <Link href={`/potatoes/${potato.slug}`} key={potato.slug}>
                  <Image src={potatoImage(potato.corruption)} width={100} height={100} alt="" />
                  <span><strong>{potato.name}</strong>{Math.round(potato.corruption)}% corrupted</span>
                </Link>
              ))}
            </div>
          ) : <p className="muted">no potato currently admits to this practice.</p>}
        </section>
      </div>
    </main>
  );
}
