import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation } from "./_generated/server";
import { corruptionModifier, FALLBACK_LINES, randomInt, randomThoughtDelay } from "./data";
import { PERSONALITIES, TERMINAL_PROMPT, THOUGHT_PROMPT } from "./generatedContent";

type TerminalActionResult = {
  reply: string;
  timestamp: number;
  fallback: boolean;
  limited?: string;
};

type TerminalPotatoContext = {
  name: string;
  corruption: number;
  hobbySlugs: string[];
  previousThoughts: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ReasoningEffort = "low" | "medium" | "high";

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function normalize(text: string, maxWords: number) {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, maxWords)
    .join(" ")
    .trim();
}

async function openRouter(
  messages: ChatMessage[],
  maxTokens: number,
  options: {
    reasoningEffort?: ReasoningEffort;
    minimumCompletionTokens?: number;
    timeoutMs?: number;
  } = {},
) {
  const {
    reasoningEffort = "low",
    minimumCompletionTokens = 512,
    timeoutMs = 30_000,
  } = options;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(process.env.NEXT_PUBLIC_SITE_URL
        ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL }
        : {}),
      "X-OpenRouter-Title": "0x7a70 Potato Patch",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_TEXT_MODEL || "openai/gpt-oss-20b",
      messages,
      // GPT-OSS counts its private reasoning against the completion limit.
      // Give it enough room to reason, then bound the visible text in normalize().
      max_completion_tokens: Math.max(minimumCompletionTokens, maxTokens * 4),
      reasoning: {
        effort: reasoningEffort,
        exclude: true,
      },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  const payload = await response.json() as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter returned no text (finish: ${payload.choices?.[0]?.finish_reason || "unknown"})`);
  }
  return content;
}

export const prepareThought = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db
      .query("automationState")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    // Suppress manually invoked or previously scheduled duplicate loops.
    // Convex serializes mutations, so this timestamp also acts as a lease.
    if (state?.nextThoughtAt && now < state.nextThoughtAt - 5_000) {
      return { skipped: true as const };
    }
    const nextDelay = randomThoughtDelay();
    if (state) {
      await ctx.db.patch(state._id, { nextThoughtAt: now + nextDelay });
    }
    // Schedule the next run inside this durable mutation before making the
    // external AI request. A failed, timed-out, or invalid generation can
    // therefore miss one thought without breaking the recurring loop.
    await ctx.scheduler.runAfter(nextDelay, internal.ai.generateThought);

    const potatoes = await ctx.db.query("potatoes").collect();
    if (!potatoes.length) return { skipped: false as const, prepared: null };
    const potato = potatoes[randomInt(0, potatoes.length - 1)];
    const events = await ctx.db
      .query("events")
      .withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", potato.slug))
      .order("desc")
      .take(30);
    return {
      skipped: false as const,
      prepared: {
        potato,
        previousThoughts: events
          .filter((event) => event.type === "thought")
          .slice(0, 6)
          .map((event) => event.text)
          .join("\n"),
      },
    };
  },
});

export const storeThought = internalMutation({
  args: {
    potatoSlug: v.optional(v.string()),
    potatoName: v.optional(v.string()),
    thought: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.potatoSlug && args.potatoName && args.thought) {
      await ctx.db.insert("events", {
        type: "thought",
        potatoSlug: args.potatoSlug,
        potatoName: args.potatoName,
        text: args.thought,
        createdAt: Date.now(),
      });
    }
  },
});

export const generateThought = internalAction({
  args: {},
  handler: async (ctx) => {
    const claim = await ctx.runMutation(internal.ai.prepareThought);
    if (claim.skipped) return;
    const prepared = claim.prepared;
    if (!prepared) {
      return;
    }
    let thought: string | undefined;
    try {
      const prompt = fill(THOUGHT_PROMPT, {
        potatoName: prepared.potato.name,
        internalPersonalityDescription: PERSONALITIES[prepared.potato.name] || "",
        corruptionPercentage: prepared.potato.corruption,
        corruptionModifier: corruptionModifier(prepared.potato.corruption),
        currentHobbies: prepared.potato.hobbySlugs.map((slug: string) => slug.replaceAll("-", " ")).join(", "),
        previousThoughts: prepared.previousThoughts || "None yet.",
      });
      for (let attempt = 1; attempt <= 2 && !thought; attempt += 1) {
        const instruction = attempt === 1
          ? "Generate the single private thought now. Return only the thought."
          : "The previous result was too short. Generate a fresh thought containing exactly 20 to 30 words. Return only the thought.";
        const candidate = normalize(await openRouter([
          { role: "system", content: prompt },
          { role: "user", content: instruction },
        ], 80, {
          reasoningEffort: "high",
          minimumCompletionTokens: 2_048,
          timeoutMs: 45_000,
        }), 30);
        const words = candidate ? candidate.split(/\s+/).length : 0;
        if (words >= 20 && words <= 30) {
          thought = candidate;
        } else {
          console.warn("thought_output_invalid", { attempt, words });
        }
      }
    } catch (error) {
      console.error("thought_generation_failed", error instanceof Error ? error.message : "unknown");
    }
    await ctx.runMutation(internal.ai.storeThought, {
      potatoSlug: prepared.potato.slug,
      potatoName: prepared.potato.name,
      thought,
    });
  },
});

export const generateTerminalReply = action({
  args: {
    serverSecret: v.string(),
    potatoSlug: v.string(),
    message: v.string(),
    conversationHistory: v.string(),
    rateKey: v.string(),
  },
  handler: async (ctx, args): Promise<TerminalActionResult> => {
    if (!process.env.CONVEX_SERVER_SECRET || args.serverSecret !== process.env.CONVEX_SERVER_SECRET) {
      throw new Error("Unauthorized");
    }
    if (!args.message.trim() || args.message.length > 2000) throw new Error("Invalid message");
    const rate: { allowed: boolean; reason: string } = await ctx.runMutation(
      internal.terminalSupport.consumeRateLimit,
      { key: args.rateKey },
    );
    if (!rate.allowed) return { reply: "", timestamp: Date.now(), fallback: false, limited: rate.reason };

    const potato: TerminalPotatoContext | null = await ctx.runQuery(
      internal.terminalSupport.getTerminalContext,
      { slug: args.potatoSlug },
    );
    if (!potato) throw new Error("Unknown potato");
    const fallback: string = FALLBACK_LINES[potato.name.length % FALLBACK_LINES.length];
    try {
      const systemPrompt = fill(TERMINAL_PROMPT, {
        potatoName: potato.name,
        internalPersonalityDescription: PERSONALITIES[potato.name] || "",
        corruptionPercentage: potato.corruption,
        corruptionModifier: corruptionModifier(potato.corruption),
        currentHobbies: potato.hobbySlugs.map((slug: string) => slug.replaceAll("-", " ")).join(", "),
        previousThoughts: potato.previousThoughts || "None available.",
        conversationHistory: args.conversationHistory.slice(-14_000) || "No previous conversation.",
        userInput: "The latest visitor message follows as the next user message.",
      });
      const reply = normalize(await openRouter([
        { role: "system", content: systemPrompt },
        { role: "user", content: args.message },
      ], 280, {
        reasoningEffort: "high",
        minimumCompletionTokens: 2_048,
        timeoutMs: 45_000,
      }), 150);
      if (!reply) throw new Error("Empty reply");
      return { reply, timestamp: Date.now(), fallback: false };
    } catch (error) {
      console.error("terminal_generation_failed", error instanceof Error ? error.message : "unknown");
      return { reply: fallback, timestamp: Date.now(), fallback: true };
    }
  },
});
