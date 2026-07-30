import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { CONVEX_URL, POTATO_NAMES, slugify } from "@/lib/constants";
import type { TerminalTurn } from "@/lib/types";

export const runtime = "nodejs";

function fallback(slug: string) {
  const lines = [
    "The root line is occupied. Your message remains warm in the soil.",
    "Static crossed the furrow before the answer arrived. Try the signal again.",
    "The patch heard you, but the underground relay closed one eye.",
  ];
  return lines[slug.length % lines.length];
}

export async function POST(request: NextRequest) {
  let body: { potatoSlug?: string; message?: string; sessionId?: string; conversation?: TerminalTurn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "the transmission was malformed." }, { status: 400 });
  }

  const potatoSlug = String(body.potatoSlug || "");
  const message = String(body.message || "").trim();
  const sessionId = String(body.sessionId || "");
  if (!POTATO_NAMES.some((name) => slugify(name) === potatoSlug) || !message || message.length > 2000 || sessionId.length > 100) {
    return NextResponse.json({ error: "the patch rejected that signal." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  if (!hmacSecret || !serverSecret) {
    return NextResponse.json({ reply: fallback(potatoSlug), timestamp: Date.now(), fallback: true });
  }
  const rateKey = createHmac("sha256", hmacSecret).update(`${ip}:${sessionId}`).digest("hex");
  const conversation = Array.isArray(body.conversation)
    ? body.conversation
      .filter((turn) => turn && (turn.role === "user" || turn.role === "potato") && typeof turn.text === "string")
      .map((turn) => `${turn.role}: ${turn.text}`)
      .join("\n")
      .split(/\s+/)
      .slice(-2000)
      .join(" ")
    : "";

  try {
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || CONVEX_URL);
    const result = await client.action(api.ai.generateTerminalReply, {
      serverSecret,
      potatoSlug,
      message,
      conversationHistory: conversation,
      rateKey,
    });
    if ("limited" in result) {
      const error = result.limited === "daily"
        ? "this root has carried enough messages for one day."
        : "the roots need ten seconds between transmissions.";
      return NextResponse.json({ error }, { status: 429 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("terminal_route_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ reply: fallback(potatoSlug), timestamp: Date.now(), fallback: true });
  }
}
