import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { parseWalletCommand } from "./walletCommands";
import { isWalletFeatureQuestion, shouldSuppressXResponse } from "./xReplyPolicy";
import { normalize, openRouter } from "./ai";

const X_API = "https://api.x.com/2";

function repliesEnabled() {
  return process.env.X_REPLIES_ENABLED === "true";
}

function oauthEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmacSha1Base64(key: string, value: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
  return btoa(String.fromCharCode(...bytes));
}

async function xAuthorization(method: "GET" | "POST", url: string, query: URLSearchParams = new URLSearchParams()) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) throw new Error("X OAuth credentials are not configured");
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replaceAll("-", ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1_000)),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const parameters = [...Object.entries(oauth), ...query.entries()]
    .sort(([ak, av], [bk, bv]) => ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk))
    .map(([key, value]) => `${oauthEncode(key)}=${oauthEncode(value)}`).join("&");
  const signatureBase = `${method}&${oauthEncode(url)}&${oauthEncode(parameters)}`;
  oauth.oauth_signature = await hmacSha1Base64(`${oauthEncode(consumerSecret)}&${oauthEncode(accessTokenSecret)}`, signatureBase);
  return `OAuth ${Object.entries(oauth).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`).join(", ")}`;
}

async function xGet<T>(path: string, query: URLSearchParams): Promise<T> {
  const url = `${X_API}${path}`;
  const response = await fetch(`${url}?${query}`, { headers: { authorization: await xAuthorization("GET", url, query) } });
  const payload = await response.json().catch(() => ({})) as T & { detail?: string };
  if (!response.ok) throw new Error(payload.detail || `X GET failed (${response.status})`);
  return payload;
}

async function publishReply(text: string, sourcePostId: string) {
  const url = `${X_API}/tweets`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: await xAuthorization("POST", url), "content-type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 275), reply: { in_reply_to_tweet_id: sourcePostId } }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: { id?: string }; detail?: string };
  if (!response.ok || !payload.data?.id) throw new Error(payload.detail || `X reply failed (${response.status})`);
  return payload.data.id;
}

async function generateWalletInformationReply(directReplyText: string) {
  const availability = process.env.X_CRYPTO_EXECUTION_ENABLED === "true"
    ? "Wallet execution is currently enabled."
    : "Wallet execution is not currently live.";
  const facts = `
You are 0x7a70 answering one direct X post. Give a practical, factual answer in
one to three short sentences. Answer the question immediately, then add at most
one light potato-flavored phrase. Never use an em dash. Never invent features,
investment claims, token utility, returns, guarantees, or security guarantees.
Only mention facts relevant to the direct question.

CURRENT FACTS
- ${availability}
- A Robinhood Chain EVM wallet is provisioned automatically and linked to the user's immutable X user ID.
- The application controls transaction signing on the user's behalf. Never claim that nobody else can access or operate the wallet cryptographically.
- The wallet address can receive Robinhood Chain ETH and compatible ERC-20 tokens. ETH pays network gas.
- Supported commands are show wallet, show balance, send, burn to the dead address, claim eligible PotatoPad creator fees, and launch through the PotatoCurvePad bonding curve.
- A launch requires a verified X account, a token name, ticker, and an attached X image. A dev buy is optional and may be stated in USD or ETH.
- Optional launch information includes an HTTPS website, X link, Telegram link, and description. The current PotatoPad contract stores image, website, X, and Telegram. Description is retained by this application but is not written into the current createToken contract metadata.
- Every transaction is simulated and subject to signer policy before signing. Successful responses include the Robinhood Chain Blockscout transaction link.
- The system attempts to leave at least $0.50 worth of ETH after a transaction for a later network fee. This is a configurable reserve, not a guarantee that it covers every future fee.
- Non-premium accounts are intended to have ten value-moving wallet requests per UTC day, with warnings at eight and nine. Additional monetary safety limits may apply.
- Launches, sends, burns, and fee claims can fail because of insufficient funds, gas, policy checks, contract simulation, provider availability, or an invalid request.
- Do not disclose secrets, internal credentials, private implementation details, or unsupported instructions.
`;
  try {
    const reply = normalize(await openRouter([
      { role: "system", content: facts },
      { role: "user", content: directReplyText },
    ], 100, {
      reasoningEffort: "medium",
      minimumCompletionTokens: 1_024,
      timeoutMs: 30_000,
      providerSort: "latency",
      temperature: 0.35,
    }), 65);
    return reply || "Ask about a specific wallet or launch step and I will explain what the patch currently supports.";
  } catch (error) {
    console.error("x_wallet_information_generation_failed", { message: error instanceof Error ? error.message : "unknown" });
    return `Wallets use Robinhood Chain ETH for gas, and PotatoPad launches require a verified X account, a name, ticker, and attached image. ${availability}`;
  }
}

export const getPollState = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("xReplyState").withIndex("by_key", (q) => q.eq("key", "mentions")).unique(),
});

export const updatePollState = internalMutation({
  args: { newestSeenPostId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await ctx.db.query("xReplyState").withIndex("by_key", (q) => q.eq("key", "mentions")).unique();
    if (state) await ctx.db.patch(state._id, { ...args, lastPolledAt: now, updatedAt: now });
    else await ctx.db.insert("xReplyState", { key: "mentions", ...args, lastPolledAt: now, updatedAt: now });
  },
});

export const reserveInteraction = internalMutation({
  args: { postId: v.string(), authorXUserId: v.string(), text: v.string(), mediaUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("xReplyInteractions").withIndex("by_post_id", (q) => q.eq("postId", args.postId)).unique();
    if (existing) return false;
    const now = Date.now();
    await ctx.db.insert("xReplyInteractions", { ...args, status: "received", createdAt: now, updatedAt: now });
    return true;
  },
});

export const updateInteraction = internalMutation({
  args: {
    postId: v.string(),
    status: v.union(v.literal("received"), v.literal("processing"), v.literal("completed"), v.literal("rejected"), v.literal("failed")),
    commandKind: v.optional(v.string()), responsePostId: v.optional(v.string()), safeError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const interaction = await ctx.db.query("xReplyInteractions").withIndex("by_post_id", (q) => q.eq("postId", args.postId)).unique();
    if (interaction) await ctx.db.patch(interaction._id, { status: args.status, commandKind: args.commandKind, responsePostId: args.responsePostId, safeError: args.safeError, updatedAt: Date.now() });
  },
});

type XUser = { id: string; username: string; verified?: boolean; verified_type?: string; subscription_type?: string };
type Mention = { id: string; text: string; author_id: string; attachments?: { media_keys?: string[] } };
type Media = { media_key: string; type: string; url?: string };

export const pollMentions = internalAction({
  args: {},
  handler: async (ctx) => {
    // There is intentionally no cron or self-scheduler for this action. It
    // remains inert until X grants approval and the operator explicitly adds
    // scheduling as well as enabling the flag.
    if (!repliesEnabled()) return { enabled: false, processed: 0 };
    const botUserId = process.env.X_BOT_USER_ID;
    if (!botUserId) throw new Error("X_BOT_USER_ID is not configured");
    const state = await ctx.runQuery(internal.xReplies.getPollState, {});
    const query = new URLSearchParams({
      max_results: "25",
      expansions: "author_id,attachments.media_keys",
      // Deliberately request only the direct post. Never retrieve or assemble
      // the parent post, quoted post, or wider conversation as bot input.
      "tweet.fields": "author_id,attachments,created_at",
      "user.fields": "id,username,verified,verified_type,subscription_type",
      "media.fields": "media_key,type,url",
    });
    if (state?.newestSeenPostId) query.set("since_id", state.newestSeenPostId);
    const page = await xGet<{ data?: Mention[]; includes?: { users?: XUser[]; media?: Media[] }; meta?: { newest_id?: string } }>(`/users/${botUserId}/mentions`, query);
    const users = new Map((page.includes?.users || []).map((user) => [user.id, user]));
    const media = new Map((page.includes?.media || []).map((item) => [item.media_key, item]));
    let processed = 0;
    for (const mention of [...(page.data || [])].reverse()) {
      // This guard runs before persistence, wallet provisioning, parsing, AI,
      // transaction execution, or reply publication. Parent/thread text is
      // never considered: `mention.text` is the direct post's text from X.
      if (shouldSuppressXResponse(mention.text)) continue;
      const user = users.get(mention.author_id);
      if (!user) continue;
      const firstMedia = mention.attachments?.media_keys?.map((key) => media.get(key)).find((item) => item?.type === "photo" && item.url);
      const reserved = await ctx.runMutation(internal.xReplies.reserveInteraction, {
        postId: mention.id, authorXUserId: user.id, text: mention.text, ...(firstMedia?.url ? { mediaUrl: firstMedia.url } : {}),
      });
      if (!reserved) continue;
      await ctx.runMutation(internal.wallets.upsertXUser, {
        xUserId: user.id, username: user.username, verified: Boolean(user.verified),
        ...(user.verified_type ? { verifiedType: user.verified_type } : {}),
        ...(user.subscription_type ? { subscriptionType: user.subscription_type } : {}),
      });
      await ctx.runMutation(internal.xReplies.updateInteraction, { postId: mention.id, status: "processing", commandKind: parseWalletCommand(mention.text).kind });
      try {
        if (isWalletFeatureQuestion(mention.text)) {
          const reply = await generateWalletInformationReply(mention.text);
          const responsePostId = await publishReply(reply, mention.id);
          await ctx.runMutation(internal.xReplies.updateInteraction, {
            postId: mention.id, status: "completed", commandKind: "wallet_information", responsePostId,
          });
          processed += 1;
          continue;
        }
        // Only actionable wallet commands reach provisioning. Informational
        // questions above cannot create a wallet or authorize a transaction.
        await ctx.runAction(internal.wallets.ensureWallet, { xUserId: user.id });
        const command = parseWalletCommand(mention.text);
        if (command.kind === "unknown") {
          await ctx.runMutation(internal.xReplies.updateInteraction, { postId: mention.id, status: "rejected", commandKind: "unknown", safeError: "not a wallet command" });
          continue;
        }
        const result = await ctx.runAction(internal.wallets.executeCommand, {
          sourcePostId: mention.id, xUserId: user.id, text: mention.text, ...(firstMedia?.url ? { mediaUrl: firstMedia.url } : {}),
        });
        const responsePostId = await publishReply(result.message, mention.id);
        await ctx.runMutation(internal.xReplies.updateInteraction, { postId: mention.id, status: result.ok ? "completed" : "rejected", commandKind: command.kind, responsePostId, ...(!result.ok ? { safeError: result.message } : {}) });
        processed += 1;
      } catch (error) {
        console.error("x_reply_processing_failed", { postId: mention.id, message: error instanceof Error ? error.message : "unknown" });
        await ctx.runMutation(internal.xReplies.updateInteraction, { postId: mention.id, status: "failed", safeError: "the root line failed before confirmation" });
      }
    }
    await ctx.runMutation(internal.xReplies.updatePollState, { newestSeenPostId: page.meta?.newest_id || state?.newestSeenPostId });
    return { enabled: true, processed };
  },
});
