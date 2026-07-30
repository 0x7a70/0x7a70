import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { randomCorruptionChange, randomDelay, randomInt, slugify, HOBBIES } from "./data";

export const changeCorruption = internalMutation({
  args: {},
  handler: async (ctx) => {
    const potatoes = await ctx.db.query("potatoes").collect();
    if (!potatoes.length) return;
    const potato = potatoes[randomInt(0, potatoes.length - 1)];
    const requested = randomCorruptionChange(potato.corruption);
    const next = Math.max(0, Math.min(100, potato.corruption + requested));
    const delta = next - potato.corruption;
    await ctx.db.patch(potato._id, { corruption: next, updatedAt: Date.now() });
    await ctx.db.insert("events", {
      type: "corruption",
      potatoSlug: potato.slug,
      potatoName: potato.name,
      text: `${potato.name}'s corruption ${delta >= 0 ? "rose" : "fell"} ${Math.abs(delta)}% to ${next}%.`,
      delta,
      createdAt: Date.now(),
    });
    const delay = randomDelay(3, 7);
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (state) await ctx.db.patch(state._id, { nextCorruptionAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.automation.changeCorruption);
  },
});

export const changeHobby = internalMutation({
  args: {},
  handler: async (ctx) => {
    const potatoes = await ctx.db.query("potatoes").collect();
    if (!potatoes.length) return;
    const potato = potatoes[randomInt(0, potatoes.length - 1)];
    const removeChance = 0.25 + 0.5 * (potato.corruption / 100);
    let remove = Math.random() < removeChance;
    if (potato.hobbySlugs.length <= 1) remove = false;
    if (potato.hobbySlugs.length >= 6) remove = true;

    const nextHobbies = [...potato.hobbySlugs];
    let hobbySlug: string;
    let type: "hobby_added" | "hobby_removed";
    if (remove) {
      const index = randomInt(0, nextHobbies.length - 1);
      hobbySlug = nextHobbies.splice(index, 1)[0];
      type = "hobby_removed";
    } else {
      const available = HOBBIES.map(slugify).filter((slug) => !nextHobbies.includes(slug));
      hobbySlug = available[randomInt(0, available.length - 1)];
      nextHobbies.push(hobbySlug);
      type = "hobby_added";
    }
    await ctx.db.patch(potato._id, { hobbySlugs: nextHobbies, updatedAt: Date.now() });
    await ctx.db.insert("events", {
      type,
      potatoSlug: potato.slug,
      potatoName: potato.name,
      hobbySlug,
      text: `${potato.name} ${remove ? "abandoned" : "began"} ${hobbySlug.replaceAll("-", " ")}.`,
      createdAt: Date.now(),
    });
    const delay = randomDelay(5, 9);
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (state) await ctx.db.patch(state._id, { nextHobbyAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.automation.changeHobby);
  },
});
