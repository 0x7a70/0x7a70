import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  potatoes: defineTable({
    slug: v.string(),
    name: v.string(),
    corruption: v.number(),
    hobbySlugs: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  hobbies: defineTable({
    slug: v.string(),
    title: v.string(),
  }).index("by_slug", ["slug"]),

  events: defineTable({
    type: v.union(
      v.literal("initialization"),
      v.literal("corruption"),
      v.literal("hobby_added"),
      v.literal("hobby_removed"),
      v.literal("thought"),
      v.literal("work_created"),
    ),
    potatoSlug: v.string(),
    potatoName: v.string(),
    text: v.string(),
    createdAt: v.number(),
    delta: v.optional(v.number()),
    hobbySlug: v.optional(v.string()),
    workSlug: v.optional(v.string()),
    workTitle: v.optional(v.string()),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_potato_created_at", ["potatoSlug", "createdAt"]),

  automationState: defineTable({
    key: v.string(),
    nextCorruptionAt: v.optional(v.number()),
    nextHobbyAt: v.optional(v.number()),
    nextThoughtAt: v.optional(v.number()),
    nextXPostAt: v.optional(v.number()),
    nextWorkAt: v.optional(v.number()),
    startedAt: v.number(),
  }).index("by_key", ["key"]),

  xPosts: defineTable({
    postId: v.string(),
    text: v.string(),
    asciiArtId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  xAsciiUsage: defineTable({
    asciiArtId: v.string(),
    postCount: v.number(),
    lastPostedAt: v.number(),
  }).index("by_ascii_art_id", ["asciiArtId"]),

  works: defineTable({
    generationId: v.string(),
    slug: v.string(),
    potatoSlug: v.string(),
    potatoName: v.string(),
    hobbySlug: v.string(),
    hobbyTitle: v.string(),
    title: v.string(),
    description: v.string(),
    shareSummary: v.string(),
    shareAction: v.string(),
    webAscii: v.string(),
    xAscii: v.string(),
    telegramAscii: v.string(),
    corruptionAtCreation: v.number(),
    fingerprint: v.string(),
    promptVersion: v.number(),
    generationAttempts: v.number(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_generation_id", ["generationId"])
    .index("by_created_at", ["createdAt"])
    .index("by_potato_created_at", ["potatoSlug", "createdAt"])
    .index("by_hobby_created_at", ["hobbySlug", "createdAt"]),

  workShares: defineTable({
    workId: v.id("works"),
    platform: v.union(v.literal("x"), v.literal("telegram")),
    status: v.union(v.literal("pending"), v.literal("posted")),
    reservedAt: v.number(),
    postedAt: v.optional(v.number()),
    externalId: v.optional(v.string()),
  })
    .index("by_work_platform", ["workId", "platform"])
    .index("by_platform_status", ["platform", "status"]),

  tokenTelemetry: defineTable({
    key: v.string(),
    contractAddress: v.string(),
    deadAddress: v.string(),
    burnedRaw: v.string(),
    totalSupplyRaw: v.string(),
    burnedTokens: v.string(),
    burnedPercent: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  rateLimits: defineTable({
    key: v.string(),
    day: v.string(),
    count: v.number(),
    lastRequestAt: v.number(),
  }).index("by_key", ["key"]),

  telegramChats: defineTable({
    chatId: v.string(),
    type: v.string(),
    title: v.optional(v.string()),
    thoughtsEnabled: v.boolean(),
    nextThoughtAt: v.optional(v.number()),
    stickersEnabled: v.optional(v.boolean()),
    nextStickerAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_chat_id", ["chatId"]),

  telegramUpdates: defineTable({
    updateId: v.string(),
    chatId: v.optional(v.string()),
    kind: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_update_id", ["updateId"]),

  telegramConversations: defineTable({
    key: v.string(),
    turns: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("potato")),
      text: v.string(),
      createdAt: v.number(),
    })),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
