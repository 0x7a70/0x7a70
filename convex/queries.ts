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

export const recentWorks = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) =>
    ctx.db.query("works").withIndex("by_created_at").order("desc").paginate(paginationOpts),
});

const publicLaunch = (launch: {
  name: string; symbol: string; imageUri: string; description?: string;
  website?: string; twitter?: string; telegram?: string; devBuyWei: string;
  transactionHash: string; tokenAddress?: string; poolAddress?: string;
  positionId?: string; devBuySucceeded?: boolean; createdAt: number; updatedAt: number;
}, launcherUsername?: string) => ({
  name: launch.name,
  symbol: launch.symbol,
  imageUri: launch.imageUri,
  description: launch.description,
  website: launch.website,
  twitter: launch.twitter,
  telegram: launch.telegram,
  devBuyWei: launch.devBuyWei,
  transactionHash: launch.transactionHash,
  tokenAddress: launch.tokenAddress!,
  poolAddress: launch.poolAddress,
  positionId: launch.positionId,
  devBuySucceeded: launch.devBuySucceeded,
  createdAt: launch.createdAt,
  updatedAt: launch.updatedAt,
  launcherUsername,
});

export const listLaunches = query({
  args: {},
  handler: async (ctx) => {
    const launches = (await ctx.db.query("tokenLaunches").collect())
      .filter((launch) => Boolean(launch.tokenAddress && launch.patchEventCreatedAt))
      .sort((left, right) => right.createdAt - left.createdAt);
    return await Promise.all(launches.map(async (launch) => {
      const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", launch.ownerXUserId)).unique();
      return publicLaunch(launch, user?.username);
    }));
  },
});

export const getLaunch = query({
  args: { tokenAddress: v.string() },
  handler: async (ctx, { tokenAddress }) => {
    const normalized = tokenAddress.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) return null;
    const launch = (await ctx.db.query("tokenLaunches").collect()).find((candidate) =>
      Boolean(candidate.patchEventCreatedAt && candidate.tokenAddress?.toLowerCase() === normalized),
    );
    if (!launch) return null;
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", launch.ownerXUserId)).unique();
    return publicLaunch(launch, user?.username);
  },
});
