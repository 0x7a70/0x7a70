import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const consumeRateLimit = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const record = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (record && now - record.lastRequestAt < 1_000) return { allowed: false, reason: "cooldown" };
    if (record && record.day === day && record.count >= 100) return { allowed: false, reason: "daily" };
    if (record) {
      await ctx.db.patch(record._id, {
        day,
        count: record.day === day ? record.count + 1 : 1,
        lastRequestAt: now,
      });
    } else {
      await ctx.db.insert("rateLimits", { key, day, count: 1, lastRequestAt: now });
    }
    return { allowed: true, reason: "ok" };
  },
});

export const getTerminalContext = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const potato = await ctx.db.query("potatoes").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!potato) return null;
    const events = await ctx.db
      .query("events")
      .withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", slug))
      .order("desc")
      .take(30);
    return {
      ...potato,
      previousThoughts: events
        .filter((event) => event.type === "thought")
        .slice(0, 6)
        .map((event) => event.text)
        .join("\n"),
    };
  },
});
