"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";
import { CONVEX_URL } from "@/lib/constants";

export function PatchProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL || CONVEX_URL),
  );
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
