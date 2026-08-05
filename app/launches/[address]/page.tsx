import type { Metadata } from "next";
import { LaunchView } from "@/components/LaunchView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const address = (await params).address;
  return {
    title: "PotatoPad launch",
    description: `a token planted through 0x7a70 on X. contract ${address}`,
  };
}

export default async function LaunchPage({ params }: { params: Promise<{ address: string }> }) {
  return <LaunchView tokenAddress={(await params).address} />;
}
