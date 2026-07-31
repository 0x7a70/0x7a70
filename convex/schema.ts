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
    ),
    potatoSlug: v.string(),
    potatoName: v.string(),
    text: v.string(),
    createdAt: v.number(),
    delta: v.optional(v.number()),
    hobbySlug: v.optional(v.string()),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_potato_created_at", ["potatoSlug", "createdAt"]),

  automationState: defineTable({
    key: v.string(),
    nextCorruptionAt: v.optional(v.number()),
    nextHobbyAt: v.optional(v.number()),
    nextThoughtAt: v.optional(v.number()),
    nextXPostAt: v.optional(v.number()),
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
