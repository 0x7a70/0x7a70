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
    const xPostDelay = randomDelay(120, 150);
    await ctx.db.insert("automationState", {
      key: "main",
      startedAt: now,
      nextCorruptionAt: now + corruptionDelay,
      nextHobbyAt: now + hobbyDelay,
      nextThoughtAt: now + thoughtDelay,
      nextXPostAt: now + xPostDelay,
    });
    await ctx.scheduler.runAfter(corruptionDelay, internal.automation.changeCorruption);
    await ctx.scheduler.runAfter(hobbyDelay, internal.automation.changeHobby);
    await ctx.scheduler.runAfter(thoughtDelay, internal.ai.generateThought);
    await ctx.scheduler.runAfter(xPostDelay, internal.x.publishXPost);
    return { initialized: true, potatoes: POTATOES.length, hobbies: HOBBIES.length };
  },
});

export const startXPosting = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    const state = await ctx.db
      .query("automationState")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!state) throw new Error("Patch is not initialized.");

    const now = Date.now();
    if (state.nextXPostAt && state.nextXPostAt > now) {
      return { started: false, message: "X posting is already scheduled.", nextXPostAt: state.nextXPostAt };
    }
    const delay = randomDelay(120, 150);
    const nextXPostAt = now + delay;
    await ctx.db.patch(state._id, { nextXPostAt });
    await ctx.scheduler.runAfter(delay, internal.x.publishXPost);
    return { started: true, nextXPostAt };
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

export const restartThoughts = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertSecret(secret);
    const state = await ctx.db
      .query("automationState")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!state) throw new Error("Patch is not initialized.");

    // Start promptly. Any older scheduled thought will see the updated
    // nextThoughtAt lease and exit without creating a duplicate loop.
    const delay = 1_000;
    await ctx.db.patch(state._id, { nextThoughtAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.ai.generateThought);
    return { restarted: true, nextThoughtAt: Date.now() + delay };
  },
});
