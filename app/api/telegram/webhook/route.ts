import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { CONVEX_URL } from "@/lib/constants";

export const runtime = "nodejs";

function secretsMatch(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const expectedWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedWebhookSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  if (!expectedWebhookSecret || !serverSecret || !secretsMatch(receivedWebhookSecret, expectedWebhookSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || CONVEX_URL);
    await client.mutation(api.telegram.receiveUpdate, {
      serverSecret,
      updateJson: JSON.stringify(update),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("telegram_webhook_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
