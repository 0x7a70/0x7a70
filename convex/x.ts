import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { fill, openRouter } from "./ai";
import { corruptionModifier, randomDelay } from "./data";
import { PERSONALITIES, X_POST_PROMPT } from "./generatedContent";

const X_POST_MINUTES = 120;
const X_POST_MAX_MINUTES = 150;
const X_POST_URL = "https://api.x.com/2/tweets";

function normalizeXPost(value: string) {
  return value
    .replaceAll("—", ",")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .split(/\r?\n(?:\s*\r?\n)*/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n\n")
    .trim();
}

function oauthEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function hmacSha1Base64(key: string, value: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
  return btoa(String.fromCharCode(...bytes));
}

async function publishToX(text: string) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error("X OAuth credentials are not configured");
  }

  const oauth: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replaceAll("-", ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1_000)),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const parameterString = Object.entries(oauth)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}=${oauthEncode(value)}`)
    .join("&");
  const signatureBase = `POST&${oauthEncode(X_POST_URL)}&${oauthEncode(parameterString)}`;
  const signingKey = `${oauthEncode(consumerSecret)}&${oauthEncode(accessTokenSecret)}`;
  oauth.oauth_signature = await hmacSha1Base64(signingKey, signatureBase);
  const authorization = `OAuth ${Object.entries(oauth)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(", ")}`;

  const response = await fetch(X_POST_URL, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json() as {
    data?: { id?: string; text?: string };
    detail?: string;
    title?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !payload.data?.id) {
    const detail = payload.detail || payload.title || payload.errors?.[0]?.message || "request failed";
    throw new Error(`X ${response.status}: ${detail}`);
  }
  return { id: payload.data.id, text: payload.data.text || text };
}

export const prepareXPost = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db
      .query("automationState")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!state) return null;
    if (state.nextXPostAt && now < state.nextXPostAt - 5_000) return null;

    // Schedule first so AI, authentication, billing, and X failures can only
    // skip one post. They cannot stop the recurring loop.
    const delay = randomDelay(X_POST_MINUTES, X_POST_MAX_MINUTES);
    await ctx.db.patch(state._id, { nextXPostAt: now + delay });
    await ctx.scheduler.runAfter(delay, internal.x.publishXPost);

    const potato = await ctx.db
      .query("potatoes")
      .withIndex("by_slug", (q) => q.eq("slug", "0x7a70"))
      .unique();
    if (!potato) return null;
    return { potato };
  },
});

export const recordXPost = internalMutation({
  args: { postId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("xPosts", { ...args, createdAt: Date.now() });
  },
});

export const publishXPost = internalAction({
  args: {},
  handler: async (ctx) => {
    const prepared = await ctx.runMutation(internal.x.prepareXPost);
    if (!prepared) return;

    const prompt = fill(X_POST_PROMPT, {
      potatoName: prepared.potato.name,
      internalPersonalityDescription: PERSONALITIES[prepared.potato.name] || "",
      corruptionPercentage: prepared.potato.corruption,
      corruptionModifier: corruptionModifier(prepared.potato.corruption),
      currentHobbies: prepared.potato.hobbySlugs.map((slug) => slug.replaceAll("-", " ")).join(", "),
      creativeSeed: crypto.randomUUID(),
      websiteInvitationMode: Math.random() < 0.2
        ? "INVITATION REQUIRED. Include the exact URL 0x7a70.wiki once. Invite the reader for one specific, naturally integrated reason, such as meeting a particular potato, talking to a potato in the terminal, watching live corruption and hobbies change, reading transmissions, following hidden clues, investigating the first mystery, or seeing what grew while they were absent. Vary the reason and phrasing. Keep the invitation in character rather than sounding like an advertisement."
        : "NO INVITATION. Do not include 0x7a70.wiki, any other URL, or a request to visit the website in this post.",
    });

    let text = "";
    for (let attempt = 1; attempt <= 10 && !text; attempt += 1) {
      try {
        const candidate = normalizeXPost(await openRouter([
          { role: "system", content: prompt },
          { role: "user", content: attempt === 1 ? "Generate the post now." : `Attempt ${attempt}: produce a completely fresh post that satisfies every format rule.` },
        ], 160, {
          reasoningEffort: "high",
          minimumCompletionTokens: 4_096,
          timeoutMs: 60_000,
          providerSort: "throughput",
          temperature: 0.95,
        }));
        const words = candidate.split(/\s+/).filter(Boolean).length;
        const sections = candidate.split("\n\n").filter(Boolean).length;
        if (words >= 30 && words <= 65 && sections >= 2 && sections <= 4 && candidate.length >= 180 && candidate.length <= 275) {
          text = candidate;
        } else {
          console.warn("x_generation_output_invalid", { attempt, words, sections, characters: candidate.length });
        }
      } catch (error) {
        console.error("x_generation_attempt_failed", {
          attempt,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    if (!text) {
      console.error("x_generation_failed", "no valid post after 10 attempts");
      return;
    }

    try {
      const posted = await publishToX(text);
      await ctx.runMutation(internal.x.recordXPost, { postId: posted.id, text: posted.text });
    } catch (error) {
      console.error("x_publish_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  },
});
