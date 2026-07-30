"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { corruptionStage, potatoImage } from "@/lib/constants";
import { FALLBACK_POTATOES } from "@/lib/fallback";
import type { Potato } from "@/lib/types";
import { CorruptionBar } from "./CorruptionBar";
import { EventFeed } from "./EventFeed";
import { SiteHeader } from "./SiteHeader";

const FIELD_POSITIONS: Array<{ x: number; y: number; scale?: number }> = [
  { x: 59.5, y: 42, scale: 1.46 },
  { x: 14, y: 20 }, { x: 36, y: 18 }, { x: 73, y: 18 }, { x: 83, y: 16 },
  { x: 22, y: 32 }, { x: 43, y: 29 }, { x: 74, y: 40 }, { x: 85, y: 28 },
  { x: 7, y: 45 }, { x: 31, y: 43 }, { x: 80, y: 44 }, { x: 88, y: 42 },
  { x: 17, y: 59 }, { x: 38, y: 57 }, { x: 69, y: 58 }, { x: 83, y: 60 },
  { x: 26, y: 73 }, { x: 48, y: 72 }, { x: 74, y: 73 },
];

const ROOT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 65, y: 42 },
  { x: 14, y: 20 }, { x: 36, y: 18 }, { x: 73, y: 18 }, { x: 94, y: 21 },
  { x: 22, y: 32 }, { x: 43, y: 29 }, { x: 81, y: 30 }, { x: 96, y: 33 },
  { x: 9, y: 45 }, { x: 33, y: 43 }, { x: 80, y: 44 }, { x: 97, y: 46 },
  { x: 19, y: 59 }, { x: 42, y: 57 }, { x: 76, y: 58 }, { x: 91, y: 60 },
  { x: 29, y: 73 }, { x: 54, y: 72 }, { x: 82, y: 73 },
];

function buildRootNetwork() {
  const width = 121;
  const height = 72;
  const center = Math.round((width - 1) * 0.65);
  const grid = Array.from({ length: height }, () => Array(width).fill(" "));
  const put = (x: number, y: number, character: string) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    grid[y][x] = grid[y][x] === " " || grid[y][x] === character ? character : "+";
  };

  const vertical = (x: number, fromY: number, toY: number, seed: number) => {
    for (let y = fromY; y <= toY; y += 1) put(x, y, (y + seed) % 7 === 0 ? "#" : "|");
  };
  const horizontal = (fromX: number, toX: number, y: number, seed: number) => {
    const direction = Math.sign(toX - fromX);
    for (let x = fromX; x !== toX; x += direction) {
      put(x, y, (Math.abs(x) + seed) % 9 === 0 ? "=" : "-");
    }
    put(toX, y, "+");
  };

  vertical(center, 0, 8, 0);

  ROOT_POSITIONS.forEach((position, index) => {
    const targetX = Math.round((position.x / 100) * (width - 1));
    // FIELD_POSITIONS describe the visual center of each potato. Root endpoints
    // use that same center rather than the image canvas's upper-left corner.
    const targetY = Math.max(12, Math.round((position.y / 100) * (height - 1)));
    if (index === 0) {
      vertical(center, 8, targetY, index);
      horizontal(center, targetX, targetY, index);
      put(targetX, targetY, "+");
      return;
    }

    const branchY = Math.min(2 + ((index - 1) % 7), targetY - 4);
    const elbowX = center + Math.round((targetX - center) * 0.7);
    horizontal(center, elbowX, branchY, index);

    let x = elbowX;
    for (let y = branchY + 1; y < targetY - 3; y += 1) {
      const direction = Math.sign(targetX - x);
      const rowsLeft = Math.max(1, targetY - 3 - y);
      if (direction && Math.abs(targetX - x) >= rowsLeft * 0.35) {
        x += direction;
        put(x, y, direction > 0 ? "\\" : "/");
      } else {
        put(x, y, (y + index) % 8 === 0 ? "#" : "|");
      }
    }
    horizontal(x, targetX, targetY - 3, index);
    vertical(targetX, targetY - 3, targetY, index);
    put(targetX, targetY, "+");
  });

  return grid.map((row) => row.join("").replace(/\s+$/, "")).join("\n");
}

export function PatchView() {
  const livePotatoes = useQuery(api.queries.listPotatoes);
  const liveAverage = useQuery(api.queries.aggregateCorruption);
  const potatoes: Potato[] = (livePotatoes?.length ? livePotatoes : FALLBACK_POTATOES) as Potato[];
  const average = liveAverage ?? potatoes.reduce((sum, potato) => sum + potato.corruption, 0) / potatoes.length;
  const stage = corruptionStage(average);
  const rootNetwork = buildRootNetwork();

  return (
    <main className={`patch-page corruption-${stage}`}>
      <SiteHeader />
      <pre className="ascii-soil" aria-hidden="true">{`
.      :      .    +       .         /       .       :
   \\       .     |    .       .          +       .
 .     +       _/ \\_       :       .          /    
      .    .  /     \\  .       +       .         .
:  .      /   :   .  \\      .      |       .     +
   +     .      .        :      .       \\       .  
`}</pre>
      <div className="patch-shell">
        <section className="patch-intro">
          <h1>the potato patch</h1>
          <Link className="lore-gate" href="/lore" aria-label="open the buried lore">
            <CorruptionBar value={average} label="overall corruption" />
          </Link>
          <p className="patch-whisper">the corruption has reached the roots.</p>
        </section>

        <div className="patch-main">
          <section className="potato-grid" aria-label="Twenty potatoes">
            <pre className="root-network" aria-hidden="true">{rootNetwork}</pre>
            {potatoes.map((potato, index) => {
              const redShift = Math.max(0, Math.min(1, (potato.corruption - 80) / 20));
              return (
                <Link
                className={`potato-card potato-corruption-${corruptionStage(potato.corruption)} ${potato.name === "0x7a70" ? "primary-potato" : ""}`}
                href={`/potatoes/${potato.slug}`}
                key={potato.slug}
                aria-label={`open ${potato.name}`}
                style={{
                  "--x": FIELD_POSITIONS[index].x,
                  "--y": FIELD_POSITIONS[index].y,
                  "--potato-scale": FIELD_POSITIONS[index].scale || 1,
                  "--blink-delay": `${-((index * 1.37) % 9).toFixed(2)}s`,
                  "--corruption-hue": `${-120 * redShift}deg`,
                  "--corruption-saturation": 1 + 1.5 * redShift,
                  "--corruption-contrast": 1 + .32 * redShift,
                  "--corruption-red-glow": `0 0 ${1 + 5 * redShift}px rgba(255, 20, 20, ${.72 * redShift})`,
                } as React.CSSProperties}
              >
                <span className="potato-image-wrap">
                  <Image src={potatoImage(potato.corruption)} width={220} height={220} alt="" priority={potato.name === "0x7a70"} />
                </span>
              </Link>
              );
            })}
          </section>
          <EventFeed />
        </div>
      </div>
    </main>
  );
}
