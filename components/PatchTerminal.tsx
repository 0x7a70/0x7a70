"use client";

import { useState } from "react";
import type { Potato } from "@/lib/types";
import { Terminal } from "./Terminal";

export function PatchTerminal({ potatoes }: { potatoes: Potato[] }) {
  const [selectedSlug, setSelectedSlug] = useState(
    potatoes.find((potato) => potato.name === "0x7a70")?.slug || potatoes[0]?.slug || "0x7a70",
  );
  const selected = potatoes.find((potato) => potato.slug === selectedSlug) || potatoes[0];

  if (!selected) return null;

  const selector = (
    <label className="patch-terminal-selector">
      <span className="sr-only">choose a potato to talk to</span>
      <select value={selected.slug} onChange={(event) => setSelectedSlug(event.target.value)}>
        {potatoes.map((potato) => (
          <option value={potato.slug} key={potato.slug}>{potato.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <Terminal
      key={selected.slug}
      potatoSlug={selected.slug}
      potatoName={selected.name}
      headerControl={selector}
      className="patch-terminal"
    />
  );
}
