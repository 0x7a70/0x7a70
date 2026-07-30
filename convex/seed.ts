import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { HOBBIES, POTATOES, randomDelay, randomInt, randomThoughtDelay, slugify } from "./data";

function assertSecret(secret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized");
}

export const initialize = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    const existing = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (existing) return { initialized: false, message: "Patch already initialized." };

    const now = Date.now();
    for (const title of HOBBIES) {
      await ctx.db.insert("hobbies", { title, slug: slugify(title) });
    }

    for (const name of POTATOES) {
      const shuffled = [...HOBBIES].sort(() => Math.random() - 0.5);
      const hobbySlugs = shuffled.slice(0, randomInt(2, 4)).map(slugify);
      const slug = slugify(name);
      await ctx.db.insert("potatoes", {
        name, slug, hobbySlugs,
        corruption: randomInt(0, 100),
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("events", {
        type: "initialization",
        potatoSlug: slug,
        potatoName: name,
        text: `${name} opened an eye beneath the soil.`,
        createdAt: now,
      });
    }

    const corruptionDelay = randomDelay(3, 7);
    const hobbyDelay = randomDelay(5, 9);
    const thoughtDelay = randomThoughtDelay();
    await ctx.db.insert("automationState", {
      key: "main",
      startedAt: now,
      nextCorruptionAt: now + corruptionDelay,
      nextHobbyAt: now + hobbyDelay,
      nextThoughtAt: now + thoughtDelay,
    });
    await ctx.scheduler.runAfter(corruptionDelay, internal.automation.changeCorruption);
    await ctx.scheduler.runAfter(hobbyDelay, internal.automation.changeHobby);
    await ctx.scheduler.runAfter(thoughtDelay, internal.ai.generateThought);
    return { initialized: true, potatoes: POTATOES.length, hobbies: HOBBIES.length };
  },
});

export const status = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    return { initialized: Boolean(state), state };
  },
});
