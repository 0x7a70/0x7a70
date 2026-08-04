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
    workId: v.optional(v.id("works")),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_post_id", ["postId"]),

  xAsciiUsage: defineTable({
    asciiArtId: v.string(),
    postCount: v.number(),
    lastPostedAt: v.number(),
  }).index("by_ascii_art_id", ["asciiArtId"]),

  xReplyUsers: defineTable({
    xUserId: v.string(),
    username: v.string(),
    verified: v.boolean(),
    verifiedType: v.optional(v.string()),
    subscriptionType: v.optional(v.string()),
    walletId: v.optional(v.id("cryptoWallets")),
    walletStatus: v.union(v.literal("none"), v.literal("provisioning"), v.literal("active"), v.literal("frozen")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_x_user_id", ["xUserId"]),

  xReplyInteractions: defineTable({
    postId: v.string(),
    authorXUserId: v.string(),
    text: v.string(),
    mediaUrl: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    commandKind: v.optional(v.string()),
    responsePostId: v.optional(v.string()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post_id", ["postId"])
    .index("by_status", ["status"]),

  xReplyState: defineTable({
    key: v.string(),
    newestSeenPostId: v.optional(v.string()),
    lastPolledAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  cryptoWallets: defineTable({
    ownerXUserId: v.string(),
    address: v.string(),
    signerWalletRef: v.string(),
    chainId: v.number(),
    status: v.union(v.literal("active"), v.literal("frozen")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_x_user_id", ["ownerXUserId"])
    .index("by_address", ["address"]),

  walletRequests: defineTable({
    requestId: v.string(),
    sourcePostId: v.string(),
    ownerXUserId: v.string(),
    walletId: v.id("cryptoWallets"),
    kind: v.string(),
    status: v.union(
      v.literal("accepted"),
      v.literal("simulating"),
      v.literal("broadcast"),
      v.literal("confirmed"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    normalizedJson: v.string(),
    safeError: v.optional(v.string()),
    transactionHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_source_post_id", ["sourcePostId"])
    .index("by_owner_created_at", ["ownerXUserId", "createdAt"]),

  walletTransactions: defineTable({
    requestId: v.string(),
    walletId: v.id("cryptoWallets"),
    chainId: v.number(),
    to: v.string(),
    valueWei: v.string(),
    callKind: v.string(),
    transactionHash: v.string(),
    status: v.union(v.literal("broadcast"), v.literal("confirmed"), v.literal("reverted")),
    blockNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_transaction_hash", ["transactionHash"]),

  tokenLaunches: defineTable({
    requestId: v.string(),
    ownerXUserId: v.string(),
    walletId: v.id("cryptoWallets"),
    launchMode: v.literal("curve"),
    name: v.string(),
    symbol: v.string(),
    imageUri: v.string(),
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    telegram: v.optional(v.string()),
    devBuyWei: v.string(),
    transactionHash: v.string(),
    tokenAddress: v.optional(v.string()),
    poolAddress: v.optional(v.string()),
    positionId: v.optional(v.string()),
    devBuySucceeded: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_owner_created_at", ["ownerXUserId", "createdAt"])
    .index("by_token_address", ["tokenAddress"]),

  walletRateLimits: defineTable({
    ownerXUserId: v.string(),
    day: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_x_user_id", ["ownerXUserId"]),

  works: defineTable({
    generationId: v.string(),
    slug: v.string(),
    potatoSlug: v.string(),
    potatoName: v.string(),
    hobbySlug: v.string(),
    hobbyTitle: v.string(),
    title: v.string(),
    description: v.string(),
    insight: v.optional(v.string()),
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
