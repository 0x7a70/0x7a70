import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

export const listPotatoes = query({
  args: {},
  handler: async (ctx) => {
    const potatoes = await ctx.db.query("potatoes").collect();
    return potatoes.sort((a, b) => a.name === "0x7a70" ? -1 : b.name === "0x7a70" ? 1 : a.name.localeCompare(b.name));
  },
});

export const getPotato = query({
  args: { slug: v.string() },
  handler: (ctx, { slug }) =>
    ctx.db.query("potatoes").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(),
});

export const listHobbies = query({
  args: {},
  handler: (ctx) => ctx.db.query("hobbies").collect(),
});

export const getHobby = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (slug === "despair") {
      const potatoes = (await ctx.db.query("potatoes").collect()).filter((potato) => potato.hobbySlugs.length === 0);
      return { slug: "despair", title: "despair", potatoes };
    }
    const hobby = await ctx.db.query("hobbies").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!hobby) return null;
    const potatoes = (await ctx.db.query("potatoes").collect()).filter((p) => p.hobbySlugs.includes(slug));
    return { ...hobby, potatoes };
  },
});

export const recentEvents = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    ctx.db.query("events").withIndex("by_created_at").order("desc").paginate(paginationOpts),
});

export const potatoEvents = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { slug, paginationOpts }) =>
    ctx.db.query("events")
      .withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", slug))
      .order("desc")
      .paginate(paginationOpts),
});

export const aggregateCorruption = query({
  args: {},
  handler: async (ctx) => {
    const potatoes = await ctx.db.query("potatoes").collect();
    if (!potatoes.length) return 0;
    return potatoes.reduce((sum, potato) => sum + potato.corruption, 0) / potatoes.length;
  },
});

export const burnTelemetry = query({
  args: {},
  handler: (ctx) =>
    ctx.db.query("tokenTelemetry").withIndex("by_key", (q) => q.eq("key", "0x7a70-burn")).unique(),
});

export const getWork = query({
  args: { slug: v.string() },
  handler: (ctx, { slug }) =>
    ctx.db.query("works").withIndex("by_slug", (q) => q.eq("slug", slug)).unique(),
});

export const potatoWorks = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { slug, paginationOpts }) =>
    ctx.db.query("works")
      .withIndex("by_potato_created_at", (q) => q.eq("potatoSlug", slug))
      .order("desc")
      .paginate(paginationOpts),
});

export const hobbyWorks = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { slug, paginationOpts }) =>
    ctx.db.query("works")
      .withIndex("by_hobby_created_at", (q) => q.eq("hobbySlug", slug))
      .order("desc")
      .paginate(paginationOpts),
});
