import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { randomCorruptionChange, randomDelay, randomInt, slugify, HOBBIES } from "./data";

const TOKEN_CONTRACT = "0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const DEFAULT_ROBINHOOD_RPC = "https://rpc.mainnet.chain.robinhood.com";

async function ethCall(data: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(process.env.ROBINHOOD_RPC_URL || DEFAULT_ROBINHOOD_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: TOKEN_CONTRACT, data }, "latest"] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Robinhood RPC returned ${response.status}`);
    const payload = await response.json() as { result?: string; error?: { message?: string } };
    if (!payload.result || !/^0x[0-9a-f]+$/i.test(payload.result)) {
      throw new Error(payload.error?.message || "Robinhood RPC returned an invalid token balance");
    }
    return BigInt(payload.result);
  } finally {
    clearTimeout(timeout);
  }
}

export const storeBurnTelemetry = internalMutation({
  args: {
    burnedRaw: v.string(),
    totalSupplyRaw: v.string(),
    burnedTokens: v.string(),
    burnedPercent: v.number(),
  },
  handler: async (ctx, values) => {
    const existing = await ctx.db.query("tokenTelemetry").withIndex("by_key", (q) => q.eq("key", "0x7a70-burn")).unique();
    const record = {
      key: "0x7a70-burn",
      contractAddress: TOKEN_CONTRACT,
      deadAddress: DEAD_ADDRESS,
      ...values,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, record);
    else await ctx.db.insert("tokenTelemetry", record);
  },
});

export const refreshBurnTelemetry = internalAction({
  args: {},
  handler: async (ctx) => {
    const paddedDeadAddress = DEAD_ADDRESS.slice(2).toLowerCase().padStart(64, "0");
    const [burnedRaw, totalSupplyRaw] = await Promise.all([
      ethCall(`0x70a08231${paddedDeadAddress}`),
      ethCall("0x18160ddd"),
    ]);
    const wholeBurned = burnedRaw / 10n ** 18n;
    const burnedPercent = totalSupplyRaw === 0n
      ? 0
      : Number((burnedRaw * 10_000n) / totalSupplyRaw) / 100;
    await ctx.runMutation(internal.automation.storeBurnTelemetry, {
      burnedRaw: burnedRaw.toString(),
      totalSupplyRaw: totalSupplyRaw.toString(),
      burnedTokens: wholeBurned.toLocaleString("en-US"),
      burnedPercent,
    });
  },
});

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
    const delay = randomDelay(32, 48);
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
    const allHobbySlugs = HOBBIES.map(slugify);
    const emptyHobbies = allHobbySlugs.filter(
      (hobbySlug) => !potatoes.some((candidate) => candidate.hobbySlugs.includes(hobbySlug)),
    );
    const restoreEmptyHobby = emptyHobbies.length > 0;
    const potato = potatoes[randomInt(0, potatoes.length - 1)];
    const baselineAddChance = 0.75 - 0.5 * (potato.corruption / 100);
    const addChance = baselineAddChance * 0.7;
    let remove = restoreEmptyHobby ? false : Math.random() >= addChance;
    if (potato.hobbySlugs.length === 0) remove = false;
    if (!restoreEmptyHobby && potato.hobbySlugs.length >= 6) remove = true;

    const nextHobbies = [...potato.hobbySlugs];
    let hobbySlug: string;
    let type: "hobby_added" | "hobby_removed";
    if (remove) {
      const index = randomInt(0, nextHobbies.length - 1);
      hobbySlug = nextHobbies.splice(index, 1)[0];
      type = "hobby_removed";
    } else {
      if (restoreEmptyHobby && nextHobbies.length >= 6) {
        const displacedIndex = randomInt(0, nextHobbies.length - 1);
        const displacedHobby = nextHobbies.splice(displacedIndex, 1)[0];
        await ctx.db.insert("events", {
          type: "hobby_removed",
          potatoSlug: potato.slug,
          potatoName: potato.name,
          hobbySlug: displacedHobby,
          text: `${potato.name} abandoned ${displacedHobby.replaceAll("-", " ")}.`,
          createdAt: Date.now(),
        });
      }
      const available = restoreEmptyHobby
        ? emptyHobbies
        : allHobbySlugs.filter((slug) => !nextHobbies.includes(slug));
      hobbySlug = available[randomInt(0, available.length - 1)];
      nextHobbies.push(hobbySlug);
      type = "hobby_added";
    }
    const lostFinalHobby = remove && nextHobbies.length === 0;
    const nextCorruption = lostFinalHobby ? Math.min(100, potato.corruption + 50) : potato.corruption;
    const corruptionDelta = nextCorruption - potato.corruption;
    await ctx.db.patch(potato._id, {
      hobbySlugs: nextHobbies,
      corruption: nextCorruption,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      type,
      potatoSlug: potato.slug,
      potatoName: potato.name,
      hobbySlug,
      text: `${potato.name} ${remove ? "abandoned" : "began"} ${hobbySlug.replaceAll("-", " ")}.`,
      createdAt: Date.now(),
    });
    if (lostFinalHobby && corruptionDelta > 0) {
      await ctx.db.insert("events", {
        type: "corruption",
        potatoSlug: potato.slug,
        potatoName: potato.name,
        delta: corruptionDelta,
        text: `${potato.name}'s corruption rose ${corruptionDelta}% to ${nextCorruption}% as despair entered the empty space.`,
        createdAt: Date.now(),
      });
    }
    const delay = randomDelay(60, 80);
    const state = await ctx.db.query("automationState").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (state) await ctx.db.patch(state._id, { nextHobbyAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.automation.changeHobby);
  },
});
