import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation } from "./_generated/server";
import { fill, normalize, openRouter } from "./ai";
import { corruptionModifier, randomDelay } from "./data";
import { PERSONALITIES, TERMINAL_PROMPT, THOUGHT_PROMPT } from "./generatedContent";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  message_thread_id?: number;
  text?: string;
  chat: { id: number; type: string; title?: string };
  from?: TelegramUser;
  entities?: Array<{ type: string; offset: number; length: number }>;
  reply_to_message?: { from?: TelegramUser };
  new_chat_members?: TelegramUser[];
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: {
    chat: { id: number; type: string; title?: string };
    new_chat_member?: { status?: string };
  };
};

type PotatoContext = {
  name: string;
  corruption: number;
  hobbySlugs: string[];
  previousThoughts: string;
};

const TELEGRAM_THOUGHT_MINUTES = 10;
const TELEGRAM_THOUGHT_MAX_MINUTES = 15;

function assertSecret(secret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized");
}

function botUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").toLowerCase();
}

function isGroup(type: string) {
  return type === "group" || type === "supergroup";
}

function mentionsBot(message: TelegramMessage) {
  const username = botUsername();
  if (!username) return false;
  const text = message.text || "";
  return text.toLowerCase().includes(`@${username}`)
    || message.reply_to_message?.from?.username?.toLowerCase() === username;
}

function cleanMention(text: string) {
  const username = botUsername();
  return text.replace(new RegExp(`@${username}\\b`, "ig"), "").trim();
}

function htmlEscape(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function telegramRequest(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as {
    ok?: boolean;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
    result?: { message_id?: number };
  };
  if (!response.ok || !payload.ok) {
    const retry = payload.parameters?.retry_after ? ` retry_after=${payload.parameters.retry_after}` : "";
    throw new Error(`Telegram ${payload.error_code || response.status}: ${payload.description || "request failed"}${retry}`);
  }
  return payload.result;
}

async function generateReply(context: PotatoContext, message: string) {
  const prompt = fill(TERMINAL_PROMPT, {
    potatoName: context.name,
    internalPersonalityDescription: PERSONALITIES[context.name] || "",
    corruptionPercentage: context.corruption,
    corruptionModifier: corruptionModifier(context.corruption),
    currentHobbies: context.hobbySlugs.map((slug) => slug.replaceAll("-", " ")).join(", "),
    previousThoughts: context.previousThoughts || "None available.",
    conversationHistory: "No previous conversation is retained for Telegram.",
    userInput: "The latest Telegram message follows as the next user message.",
  });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const reply = normalize(await openRouter([
        { role: "system", content: `${prompt}\n\nTELEGRAM DELIVERY\nReply as 0x7a70 in one self-contained message. Do not include a name label or mention tag.` },
        { role: "user", content: message },
      ], 280, {
        reasoningEffort: attempt === 1 ? "high" : "medium",
        minimumCompletionTokens: attempt === 1 ? 1_536 : 1_024,
        timeoutMs: attempt === 1 ? 45_000 : 32_000,
        providerSort: attempt === 1 ? "throughput" : "latency",
      }), 150);
      if (reply) return reply;
    } catch (error) {
      console.error("telegram_reply_generation_attempt_failed", {
        attempt,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return "the root line folded before your message reached me. press the soil again.";
}

async function generateWelcome(context: PotatoContext, firstName: string) {
  const system = `You are 0x7a70, a literal living potato in the potato patch.\n\nPersonality:\n${PERSONALITIES[context.name] || ""}\n\nCorruption: ${context.corruption}%\n${corruptionModifier(context.corruption)}\n\nCurrent hobbies: ${context.hobbySlugs.map((slug) => slug.replaceAll("-", " ")).join(", ")}\n\nA human named ${firstName} has just entered your Telegram group. Welcome them directly in 15 to 35 words. Be cryptic, sincere, distinctly 0x7a70, and understandable. Do not include their name, a heading, quotation marks, markdown, or an @mention. Do not claim to know anything about them.`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const welcome = normalize(await openRouter([
        { role: "system", content: system },
        { role: "user", content: "Produce the welcome now." },
      ], 70, {
        reasoningEffort: attempt === 1 ? "medium" : "low",
        minimumCompletionTokens: attempt === 1 ? 768 : 512,
        timeoutMs: 30_000,
        providerSort: "latency",
      }), 35);
      if (welcome) return welcome;
    } catch (error) {
      console.error("telegram_welcome_generation_attempt_failed", {
        attempt,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return "you have entered while the roots were rearranging themselves. watch the repeated marks; one of them may already recognize you.";
}

export const receiveUpdate = mutation({
  args: { serverSecret: v.string(), updateJson: v.string() },
  handler: async (ctx, { serverSecret, updateJson }) => {
    assertSecret(serverSecret);
    const update = JSON.parse(updateJson) as TelegramUpdate;
    const updateId = String(update.update_id);
    const existing = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", updateId))
      .unique();
    if (existing) return { accepted: true, duplicate: true };

    const now = Date.now();
    const message = update.message;
    const membership = update.my_chat_member;
    const chat = message?.chat || membership?.chat;
    const chatId = chat ? String(chat.id) : undefined;
    const updateRecord = await ctx.db.insert("telegramUpdates", {
      updateId,
      chatId,
      kind: membership ? "membership" : message?.new_chat_members?.length ? "welcome" : "message",
      status: "received",
      createdAt: now,
      updatedAt: now,
    });

    if (chat && isGroup(chat.type)) {
      const stored = await ctx.db
        .query("telegramChats")
        .withIndex("by_chat_id", (q) => q.eq("chatId", String(chat.id)))
        .unique();
      const inactive = membership && ["left", "kicked"].includes(membership.new_chat_member?.status || "");
      if (stored) {
        await ctx.db.patch(stored._id, {
          type: chat.type,
          title: chat.title,
          thoughtsEnabled: inactive ? false : stored.thoughtsEnabled,
          updatedAt: now,
        });
        if (!inactive && !stored.nextThoughtAt) {
          const delay = randomDelay(TELEGRAM_THOUGHT_MINUTES, TELEGRAM_THOUGHT_MAX_MINUTES);
          await ctx.db.patch(stored._id, { nextThoughtAt: now + delay });
          await ctx.scheduler.runAfter(delay, internal.telegram.generateGroupThought, { chatId: String(chat.id) });
        }
      } else if (!inactive) {
        const delay = randomDelay(TELEGRAM_THOUGHT_MINUTES, TELEGRAM_THOUGHT_MAX_MINUTES);
        await ctx.db.insert("telegramChats", {
          chatId: String(chat.id),
          type: chat.type,
          title: chat.title,
          thoughtsEnabled: true,
          nextThoughtAt: now + delay,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(delay, internal.telegram.generateGroupThought, { chatId: String(chat.id) });
      }
    }

    if (membership) {
      await ctx.db.patch(updateRecord, { status: "ignored", updatedAt: Date.now() });
      return { accepted: true, duplicate: false };
    }

    if (!message) {
      await ctx.db.patch(updateRecord, { status: "ignored", updatedAt: Date.now() });
      return { accepted: true, duplicate: false };
    }

    for (const member of message.new_chat_members || []) {
      if (member.is_bot) continue;
      await ctx.scheduler.runAfter(0, internal.telegram.processWelcome, {
        updateId,
        chatId: String(message.chat.id),
        messageId: message.message_id,
        threadId: message.message_thread_id,
        userId: String(member.id),
        firstName: member.first_name || "new arrival",
        username: member.username,
      });
    }
    if (message.new_chat_members?.length) {
      await ctx.db.patch(updateRecord, { status: "queued", updatedAt: Date.now() });
      return { accepted: true, duplicate: false };
    }

    const text = message.text?.trim();
    const privateChat = message.chat.type === "private";
    if (!text || message.from?.is_bot || (!privateChat && !mentionsBot(message))) {
      await ctx.db.patch(updateRecord, { status: "ignored", updatedAt: Date.now() });
      return { accepted: true, duplicate: false };
    }
    const cleaned = privateChat ? text : cleanMention(text);
    if (!cleaned) {
      await ctx.db.patch(updateRecord, { status: "ignored", updatedAt: Date.now() });
      return { accepted: true, duplicate: false };
    }
    await ctx.scheduler.runAfter(0, internal.telegram.processIncoming, {
      updateId,
      chatId: String(message.chat.id),
      messageId: message.message_id,
      threadId: message.message_thread_id,
      userId: String(message.from?.id || 0),
      text: cleaned.slice(0, 2_000),
    });
    await ctx.db.patch(updateRecord, { status: "queued", updatedAt: Date.now() });
    return { accepted: true, duplicate: false };
  },
});

export const finishUpdate = internalMutation({
  args: { updateId: v.string(), status: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .unique();
    if (record) await ctx.db.patch(record._id, { status: args.status, error: args.error, updatedAt: Date.now() });
  },
});

export const processIncoming = internalAction({
  args: {
    updateId: v.string(),
    chatId: v.string(),
    messageId: v.number(),
    threadId: v.optional(v.number()),
    userId: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const rate = await ctx.runMutation(internal.terminalSupport.consumeRateLimit, {
        key: `telegram:${args.userId}`,
      });
      if (!rate.allowed) {
        await telegramRequest("sendMessage", {
          chat_id: args.chatId,
          text: rate.reason === "daily"
            ? "your signal has crossed the daily root limit. the soil will reopen at the next utc dawn."
            : "the root is still carrying your last transmission. wait one second.",
          reply_parameters: { message_id: args.messageId },
          ...(args.threadId ? { message_thread_id: args.threadId } : {}),
        });
        await ctx.runMutation(internal.telegram.finishUpdate, { updateId: args.updateId, status: "limited" });
        return;
      }
      const context = await ctx.runQuery(internal.terminalSupport.getTerminalContext, { slug: "0x7a70" }) as PotatoContext | null;
      if (!context) throw new Error("0x7a70 is not initialized");
      const reply = await generateReply(context, args.text);
      await telegramRequest("sendMessage", {
        chat_id: args.chatId,
        text: reply,
        reply_parameters: { message_id: args.messageId },
        ...(args.threadId ? { message_thread_id: args.threadId } : {}),
      });
      await ctx.runMutation(internal.telegram.finishUpdate, { updateId: args.updateId, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("telegram_incoming_failed", { updateId: args.updateId, message });
      await ctx.runMutation(internal.telegram.finishUpdate, { updateId: args.updateId, status: "failed", error: message.slice(0, 500) });
    }
  },
});

export const processWelcome = internalAction({
  args: {
    updateId: v.string(),
    chatId: v.string(),
    messageId: v.number(),
    threadId: v.optional(v.number()),
    userId: v.string(),
    firstName: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const context = await ctx.runQuery(internal.terminalSupport.getTerminalContext, { slug: "0x7a70" }) as PotatoContext | null;
      if (!context) throw new Error("0x7a70 is not initialized");
      const welcome = await generateWelcome(context, args.firstName);
      const label = args.username ? `@${htmlEscape(args.username)}` : htmlEscape(args.firstName);
      const mention = `<a href="tg://user?id=${args.userId}">${label}</a>`;
      await telegramRequest("sendMessage", {
        chat_id: args.chatId,
        text: `${mention} ${htmlEscape(welcome)}`,
        parse_mode: "HTML",
        reply_parameters: { message_id: args.messageId },
        ...(args.threadId ? { message_thread_id: args.threadId } : {}),
      });
      await ctx.runMutation(internal.telegram.finishUpdate, { updateId: args.updateId, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error("telegram_welcome_failed", { updateId: args.updateId, message });
      await ctx.runMutation(internal.telegram.finishUpdate, { updateId: args.updateId, status: "failed", error: message.slice(0, 500) });
    }
  },
});

export const prepareGroupThought = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.query("telegramChats").withIndex("by_chat_id", (q) => q.eq("chatId", chatId)).unique();
    if (!chat || !chat.thoughtsEnabled) return null;
    const now = Date.now();
    if (chat.nextThoughtAt && now < chat.nextThoughtAt - 5_000) return null;
    const delay = randomDelay(TELEGRAM_THOUGHT_MINUTES, TELEGRAM_THOUGHT_MAX_MINUTES);
    await ctx.db.patch(chat._id, { nextThoughtAt: now + delay, updatedAt: now });
    await ctx.scheduler.runAfter(delay, internal.telegram.generateGroupThought, { chatId });
    const context = await ctx.db.query("potatoes").withIndex("by_slug", (q) => q.eq("slug", "0x7a70")).unique();
    if (!context) return null;
    const events = await ctx.db
      .query("events")
      .withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", "0x7a70"))
      .order("desc")
      .take(30);
    return {
      context,
      previousThoughts: events.filter((event) => event.type === "thought").slice(0, 6).map((event) => event.text).join("\n"),
    };
  },
});

export const storeTelegramThought = internalMutation({
  args: { thought: v.string() },
  handler: async (ctx, { thought }) => {
    await ctx.db.insert("events", {
      type: "thought",
      potatoSlug: "0x7a70",
      potatoName: "0x7a70",
      text: thought,
      createdAt: Date.now(),
    });
  },
});

export const generateGroupThought = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const prepared = await ctx.runMutation(internal.telegram.prepareGroupThought, { chatId });
    if (!prepared) return;
    const prompt = fill(THOUGHT_PROMPT, {
      potatoName: prepared.context.name,
      internalPersonalityDescription: PERSONALITIES[prepared.context.name] || "",
      corruptionPercentage: prepared.context.corruption,
      corruptionModifier: corruptionModifier(prepared.context.corruption),
      currentHobbies: prepared.context.hobbySlugs.map((slug: string) => slug.replaceAll("-", " ")).join(", "),
      previousThoughts: prepared.previousThoughts || "None yet.",
    });
    let thought = "";
    for (let attempt = 1; attempt <= 3 && !thought; attempt += 1) {
      try {
        const candidate = normalize(await openRouter([
          { role: "system", content: prompt },
          { role: "user", content: "Generate the single private thought now. Return only the thought." },
        ], 80, {
          reasoningEffort: attempt === 1 ? "high" : "medium",
          minimumCompletionTokens: attempt === 1 ? 1_536 : 1_024,
          timeoutMs: 40_000,
          providerSort: attempt === 1 ? "throughput" : "latency",
        }), 30);
        const words = candidate ? candidate.split(/\s+/).length : 0;
        if (words >= 20 && words <= 30) thought = candidate;
      } catch (error) {
        console.error("telegram_thought_generation_attempt_failed", {
          attempt,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    if (!thought) return;
    try {
      await telegramRequest("sendMessage", {
        chat_id: chatId,
        text: `0x7a70 // ${prepared.context.corruption}% corruption\n\n${thought}`,
      });
      await ctx.runMutation(internal.telegram.storeTelegramThought, { thought });
    } catch (error) {
      console.error("telegram_thought_send_failed", {
        chatId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  },
});
