import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation } from "./_generated/server";
import { corruptionModifier, FALLBACK_LINES, randomDelay, randomInt, randomThoughtDelay } from "./data";
import { PERSONALITIES, TERMINAL_PROMPT, THOUGHT_PROMPT, WORK_PROMPT } from "./generatedContent";
import { WORK_KINDS } from "./workKinds";
import { walletFeaturePrompt } from "./walletFeaturePrompt";

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
  recentWorks: string;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ReasoningEffort = "low" | "medium" | "high";
const THOUGHT_MAX_ATTEMPTS = 10;
const WORK_MAX_ATTEMPTS = 10;
const WORK_MINUTES = 720;
const WORK_MAX_MINUTES = 840;

type OpenRouterPayload = {
  error?: { code?: number; message?: string; metadata?: { error_type?: string } };
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
};

export function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function normalize(text: string, maxWords: number) {
  return text
    .replaceAll("—", ",")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, maxWords)
    .join(" ")
    .trim();
}

export async function openRouter(
  messages: ChatMessage[],
  maxTokens: number,
  options: {
    reasoningEffort?: ReasoningEffort;
    minimumCompletionTokens?: number;
    timeoutMs?: number;
    providerSort?: "latency" | "throughput";
    temperature?: number;
  } = {},
) {
  const {
    reasoningEffort = "low",
    minimumCompletionTokens = 512,
    timeoutMs = 30_000,
    providerSort,
    temperature = 0.7,
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
      provider: providerSort ? { sort: providerSort } : undefined,
      temperature,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json() as OpenRouterPayload;
  if (!response.ok || payload.error) {
    const code = payload.error?.code || response.status;
    const type = payload.error?.metadata?.error_type || "unknown";
    const message = payload.error?.message || response.statusText || "request failed";
    throw new Error(`OpenRouter ${code} ${type}: ${message}`);
  }
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string"
    ? rawContent
    : rawContent?.map((part) => part.text || "").join("");
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
    const works = await ctx.db.query("works").withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", potato.slug)).order("desc").take(4);
    return {
      skipped: false as const,
      prepared: {
        potato,
        previousThoughts: events
          .filter((event) => event.type === "thought")
          .slice(0, 6)
          .map((event) => event.text)
          .join("\n"),
        recentWorks: works.map((work) => `${work.title}: ${work.shareSummary}`).join("\n"),
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
    const prompt = fill(THOUGHT_PROMPT, {
      potatoName: prepared.potato.name,
      internalPersonalityDescription: PERSONALITIES[prepared.potato.name] || "",
      corruptionPercentage: prepared.potato.corruption,
      corruptionModifier: corruptionModifier(prepared.potato.corruption),
      currentHobbies: prepared.potato.hobbySlugs.map((slug: string) => slug.replaceAll("-", " ")).join(", "),
      previousThoughts: prepared.previousThoughts || "None yet.",
      recentWorks: prepared.recentWorks || "None yet.",
    });
    for (let attempt = 1; attempt <= THOUGHT_MAX_ATTEMPTS && !thought; attempt += 1) {
      try {
        const recoveryAttempt = attempt > Math.ceil(THOUGHT_MAX_ATTEMPTS / 2);
        const instruction = attempt === 1
          ? "Generate the single private thought now. Return only the thought."
          : "The previous attempt did not produce a valid result. Generate a fresh thought containing exactly 20 to 30 words. Return only the thought.";
        const candidate = normalize(await openRouter([
          { role: "system", content: prompt },
          { role: "user", content: instruction },
        ], 80, {
          reasoningEffort: recoveryAttempt ? "medium" : "high",
          minimumCompletionTokens: 4_096,
          timeoutMs: recoveryAttempt ? 40_000 : 50_000,
          providerSort: recoveryAttempt ? "latency" : "throughput",
        }), 30);
        const words = candidate ? candidate.split(/\s+/).length : 0;
        if (words >= 20 && words <= 30) {
          thought = candidate;
        } else {
          console.warn("thought_output_invalid", { attempt, words });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.error("thought_generation_attempt_failed", { attempt, message });
        // Authentication, permission, and exhausted-credit failures cannot be
        // repaired by retrying the same request ten times.
        if (/\b(401|402|403)\b/.test(message)) break;
      }

      if (!thought && attempt < THOUGHT_MAX_ATTEMPTS) {
        const retryDelay = Math.min(3_000, 500 * attempt);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
    if (!thought) {
      console.error("thought_generation_failed", `no valid output after ${THOUGHT_MAX_ATTEMPTS} attempts`);
    }
    await ctx.runMutation(internal.ai.storeThought, {
      potatoSlug: prepared.potato.slug,
      potatoName: prepared.potato.name,
      thought,
    });
  },
});

type GeneratedWork = {
  title: string;
  description: string;
  insight: string;
  shareSummary: string;
  shareAction: string;
  webAsciiLines: string[];
  xAsciiLines: string[];
  telegramAsciiLines: string[];
};

function cleanWorkText(value: unknown) {
  return typeof value === "string"
    ? value.replaceAll("—", ",").replace(/\s+/g, " ").trim()
    : "";
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function validateAscii(value: unknown, minLines: number, maxLines: number, maxWidth: number) {
  if (!Array.isArray(value) || value.length < minLines || value.length > maxLines) return null;
  const lines = value.map((line) => typeof line === "string" ? line.replaceAll("\t", "  ").replaceAll("—", "-").trimEnd() : "");
  if (lines.some((line) => !line || line.length > maxWidth || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(line))) return null;
  const art = lines.join("\n");
  if (/```|root_\d+|https?:\/\//i.test(art)) return null;
  return art;
}

function parseGeneratedWork(raw: string): GeneratedWork | null {
  try {
    const candidate = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const title = cleanWorkText(parsed.title).toLowerCase();
    const description = cleanWorkText(parsed.description);
    const insight = cleanWorkText(parsed.insight);
    const shareSummary = cleanWorkText(parsed.shareSummary);
    const shareAction = cleanWorkText(parsed.shareAction).toLowerCase();
    const webAscii = validateAscii(parsed.webAsciiLines, 7, 18, 54);
    const xAscii = validateAscii(parsed.xAsciiLines, 6, 16, 42);
    const telegramAscii = validateAscii(parsed.telegramAsciiLines, 6, 16, 44);
    if (wordCount(title) < 2 || wordCount(title) > 7 || title.length > 70) return null;
    if (wordCount(description) < 22 || wordCount(description) > 45) return null;
    if (wordCount(insight) < 22 || wordCount(insight) > 45) return null;
    if (wordCount(shareSummary) < 8 || wordCount(shareSummary) > 20) return null;
    if (wordCount(shareAction) < 1 || wordCount(shareAction) > 5) return null;
    if (!webAscii || !xAscii || !telegramAscii) return null;
    return { title, description, insight, shareSummary, shareAction, webAsciiLines: webAscii.split("\n"), xAsciiLines: xAscii.split("\n"), telegramAsciiLines: telegramAscii.split("\n") };
  } catch {
    return null;
  }
}

export const ensureWorkLoop = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (!state) return;
    const now = Date.now();
    if (state.nextWorkAt && state.nextWorkAt > now - 5_000) return;
    // The first deployment produces one test work promptly. prepareWork then
    // commits the normal 3-3.5 hour successor before generation begins.
    const delay = 1_000;
    await ctx.db.patch(state._id, { nextWorkAt: now + delay });
    await ctx.scheduler.runAfter(delay, internal.ai.generateWork);
  },
});

export const prepareWork = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (!state) return null;
    if (state.nextWorkAt && now < state.nextWorkAt - 5_000) return null;
    const delay = randomDelay(WORK_MINUTES, WORK_MAX_MINUTES);
    await ctx.db.patch(state._id, { nextWorkAt: now + delay });
    await ctx.scheduler.runAfter(delay, internal.ai.generateWork);

    const potatoes = (await ctx.db.query("potatoes").collect()).filter((potato) => potato.hobbySlugs.length > 0);
    if (!potatoes.length) return null;
    const potato = potatoes[randomInt(0, potatoes.length - 1)];
    const hobbySlug = potato.hobbySlugs[randomInt(0, potato.hobbySlugs.length - 1)];
    const hobby = await ctx.db.query("hobbies").withIndex("by_slug", (q) => q.eq("slug", hobbySlug)).unique();
    if (!hobby) return null;
    const recentByHobby = await ctx.db.query("works").withIndex("by_hobby_created_at", (q) => q.eq("hobbySlug", hobbySlug)).order("desc").take(6);
    const recentByPotato = await ctx.db.query("works").withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", potato.slug)).order("desc").take(6);
    const recent = [...recentByPotato, ...recentByHobby].filter((work, index, all) => all.findIndex((candidate) => candidate._id === work._id) === index).slice(0, 10);
    return {
      generationId: `${now.toString(36)}-${randomInt(100000, 999999)}`,
      potato,
      hobby,
      recentWorks: recent.map((work) => `${work.potatoName}: ${work.title} // ${work.shareSummary}`).join("\n"),
    };
  },
});

export const storeWork = internalMutation({
  args: {
    generationId: v.string(),
    potatoSlug: v.string(),
    potatoName: v.string(),
    hobbySlug: v.string(),
    hobbyTitle: v.string(),
    corruptionAtCreation: v.number(),
    title: v.string(),
    description: v.string(),
    insight: v.string(),
    shareSummary: v.string(),
    shareAction: v.string(),
    webAscii: v.string(),
    xAscii: v.string(),
    telegramAscii: v.string(),
    generationAttempts: v.number(),
  },
  handler: async (ctx, args) => {
    const existingGeneration = await ctx.db.query("works").withIndex("by_generation_id", (q) => q.eq("generationId", args.generationId)).unique();
    if (existingGeneration) return existingGeneration.slug;
    const fingerprint = `${args.title.toLowerCase()}|${args.webAscii.replace(/\s+/g, "")}`;
    const duplicate = (await ctx.db.query("works").collect()).some((work) => work.fingerprint === fingerprint);
    if (duplicate) throw new Error("Duplicate work fingerprint");
    const base = `${args.potatoSlug}-${args.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 62) || "buried-work";
    let slug = `${base}-${args.generationId.slice(-6)}`;
    if (await ctx.db.query("works").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()) slug = `${base}-${Date.now().toString(36)}`;
    const createdAt = Date.now();
    await ctx.db.insert("works", { ...args, slug, fingerprint, promptVersion: 1, createdAt });
    await ctx.db.insert("events", {
      type: "work_created",
      potatoSlug: args.potatoSlug,
      potatoName: args.potatoName,
      hobbySlug: args.hobbySlug,
      workSlug: slug,
      workTitle: args.title,
      text: `${args.potatoName} ${args.shareAction} ${args.title} while practicing ${args.hobbyTitle}.`,
      createdAt,
    });
    return slug;
  },
});

export const generateWork = internalAction({
  args: {},
  handler: async (ctx) => {
    const prepared = await ctx.runMutation(internal.ai.prepareWork);
    if (!prepared) return;
    const workKind = WORK_KINDS[prepared.hobby.slug] || { kind: "a concrete result of the practice", verbs: ["created", "completed"] };
    const prompt = fill(WORK_PROMPT, {
      potatoName: prepared.potato.name,
      internalPersonalityDescription: PERSONALITIES[prepared.potato.name] || "",
      corruptionPercentage: prepared.potato.corruption,
      corruptionModifier: corruptionModifier(prepared.potato.corruption),
      hobbyTitle: prepared.hobby.title,
      workKind: workKind.kind,
      actionVerbs: workKind.verbs.join(", "),
      recentWorks: prepared.recentWorks || "No works have surfaced from this practice yet.",
      creativeSeed: `${prepared.generationId} / ${randomInt(100000, 999999)}`,
    });
    for (let attempt = 1; attempt <= WORK_MAX_ATTEMPTS; attempt += 1) {
      try {
        const raw = await openRouter([
          { role: "system", content: prompt },
          { role: "user", content: attempt === 1 ? "Create the work now. Return JSON only." : `Attempt ${attempt}: create a different valid work and return JSON only.` },
        ], 900, {
          reasoningEffort: attempt <= 5 ? "high" : "medium",
          minimumCompletionTokens: 8_192,
          timeoutMs: attempt <= 5 ? 65_000 : 50_000,
          providerSort: attempt <= 5 ? "throughput" : "latency",
          temperature: 0.95,
        });
        const work = parseGeneratedWork(raw);
        if (!work) {
          console.warn("work_generation_output_invalid", { attempt, generationId: prepared.generationId });
          continue;
        }
        await ctx.runMutation(internal.ai.storeWork, {
          generationId: prepared.generationId,
          potatoSlug: prepared.potato.slug,
          potatoName: prepared.potato.name,
          hobbySlug: prepared.hobby.slug,
          hobbyTitle: prepared.hobby.title,
          corruptionAtCreation: prepared.potato.corruption,
          title: work.title,
          description: work.description,
          insight: work.insight,
          shareSummary: work.shareSummary,
          shareAction: work.shareAction,
          webAscii: work.webAsciiLines.join("\n"),
          xAscii: work.xAsciiLines.join("\n"),
          telegramAscii: work.telegramAsciiLines.join("\n"),
          generationAttempts: attempt,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.error("work_generation_attempt_failed", { attempt, generationId: prepared.generationId, message });
        if (/\b(401|402|403)\b/.test(message)) break;
      }
    }
    console.error("work_generation_failed", { generationId: prepared.generationId, attempts: WORK_MAX_ATTEMPTS });
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
    const systemPrompt = `${fill(TERMINAL_PROMPT, {
      potatoName: potato.name,
      internalPersonalityDescription: PERSONALITIES[potato.name] || "",
      corruptionPercentage: potato.corruption,
      corruptionModifier: corruptionModifier(potato.corruption),
      currentHobbies: potato.hobbySlugs.map((slug: string) => slug.replaceAll("-", " ")).join(", "),
      previousThoughts: potato.previousThoughts || "None available.",
      recentWorks: potato.recentWorks || "None available.",
      conversationHistory: args.conversationHistory.slice(-14_000) || "No previous conversation.",
      userInput: "The latest visitor message follows as the next user message.",
    })}${walletFeaturePrompt()}`;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        // Preserve the full-quality first attempt. If that route fails, use a
        // smaller reasoning budget and latency-first routing rather than
        // repeating the same likely provider failure.
        const recoveryAttempt = attempt > 1;
        const reply = normalize(await openRouter([
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message },
        ], 280, {
          reasoningEffort: recoveryAttempt ? "medium" : "high",
          minimumCompletionTokens: 3_072,
          timeoutMs: recoveryAttempt ? 32_000 : 45_000,
          providerSort: recoveryAttempt ? "latency" : "throughput",
        }), 150);
        if (!reply) throw new Error("Empty reply");
        return { reply, timestamp: Date.now(), fallback: false };
      } catch (error) {
        console.error("terminal_generation_attempt_failed", {
          attempt,
          message: error instanceof Error ? error.message : "unknown",
        });
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    console.error("terminal_generation_failed", "no valid reply after 2 attempts");
    return { reply: fallback, timestamp: Date.now(), fallback: true };
  },
});
