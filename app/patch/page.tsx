import type { Metadata } from "next";
import { PatchView } from "@/components/PatchView";

export const metadata: Metadata = { title: "potato patch" };

export default function PatchPage() {
  return <PatchView />;
}
