import { openRouter } from "./ai";
import { parseWalletCommand, validateStructuredWalletCommand, type WalletCommand } from "./walletCommands";

export type WalletHelpTopic = "capabilities" | "wallet" | "fund" | "balance" | "send" | "buy_sell" | "burn" | "launch" | "fees";
export type XWalletIntent =
  | { kind: "irrelevant" }
  | { kind: "unknown_wallet" }
  | { kind: "help"; topic: WalletHelpTopic }
  | { kind: "command"; command: WalletCommand };

const WALLET_WORDS = /\b(?:wallet|address|balance|fund|deposit|send|transfer|give|buy|sell|swap|burn|claim|fees?|launch|plant|deploy|token|coin|ticker|slippage|dev\s*buy)\b/i;

export function walletHelpMessage(topic: WalletHelpTopic) {
  const messages: Record<WalletHelpTopic, string> = {
    capabilities: "I can create your wallet, show balances, buy, sell, send, burn, claim eligible creator fees, and launch tokens through PotatoPad. Ask what you want to do and include the amount and token when needed.",
    wallet: "Ask me for your wallet and I'll return its Robinhood Chain explorer link. It stays tied to your X account. Fund it with ETH for transactions and gas.",
    fund: "Ask me for your wallet, open the link, and send Robinhood Chain ETH or supported tokens to it. Keep some ETH available for network gas.",
    balance: "Ask 'what is my balance?' to see your nonzero ETH and known token balances, or name one ticker or contract to check it.",
    send: "Tell me the amount, asset, and destination X handle or wallet. Example: send 25 $0x7a70 to @user. You can also say half, all, or a percentage.",
    buy_sell: "Tell me buy or sell, the amount, and the ticker or contract. Example: buy $20 of $0x7a70 or sell half my $0x7a70. You can optionally set slippage.",
    burn: "Use the exact word burn with an amount and ticker or contract. Example: burn 25 $0x7a70, burn $10 of $0x7a70, or burn half my $0x7a70.",
    launch: "Ask me for your wallet, then fund it with ETH. Ask me to launch your token with a name and ticker. An image, website, social links, and dev buy are optional. If you attach an image, I'll use it. It goes live on PotatoPad instantly.",
    fees: "Ask me to claim fees and include the token ticker or contract if needed. I can claim eligible creator fees from tokens you launched through PotatoPad.",
  };
  return messages[topic];
}

export function unknownWalletMessage() {
  return "I couldn't quite make that out. Try: 'show my wallet', 'buy $20 of $0x7a70', 'send 25 $0x7a70 to @user', 'burn half my $0x7a70', or 'launch Potato Seed, ticker SEED'.";
}

function explicitAuthority(text: string, command: WalletCommand) {
  if (command.kind === "send") return /\b(?:send|transfer|give)\b/i.test(text);
  if (command.kind === "burn") return /\bburn\b/i.test(text);
  if (command.kind === "buy") return /\bbuy\b/i.test(text);
  if (command.kind === "sell") return /\bsell\b/i.test(text);
  if (command.kind === "claim_fees") return /\bclaim\b/i.test(text);
  if (command.kind === "launch") return /\b(?:launch|plant|deploy|create|sprout)\b/i.test(text);
  return true;
}

function includesLoose(text: string, value: string) {
  const normalizedText = text.toLowerCase().replaceAll(",", "").replace(/^\s+|\s+$/g, "");
  const normalizedValue = value.toLowerCase().replace(/^\$/, "");
  return normalizedText.includes(normalizedValue) || text.toLowerCase().includes(`$${normalizedValue}`);
}

function fieldsAreGrounded(text: string, command: WalletCommand) {
  if (command.kind === "send") {
    const amountGrounded = includesLoose(text, command.amount)
      || (command.unit === "percent" && command.amount === "100" && /\ball(?:\s+of)?\b/i.test(text))
      || (command.unit === "percent" && command.amount === "50" && /\bhalf(?:\s+of)?\b/i.test(text));
    return amountGrounded && includesLoose(text, command.recipient) && (!command.token || includesLoose(text, command.token));
  }
  if (command.kind === "burn" || command.kind === "buy" || command.kind === "sell") {
    const amountGrounded = includesLoose(text, command.amount)
      || (command.unit === "percent" && command.amount === "100" && /\ball(?:\s+of)?\b/i.test(text))
      || (command.unit === "percent" && command.amount === "50" && /\bhalf(?:\s+of)?\b/i.test(text));
    return amountGrounded && includesLoose(text, command.token);
  }
  if (command.kind === "claim_fees") return !command.token || includesLoose(text, command.token);
  if (command.kind === "show_balance") return !command.token || includesLoose(text, command.token);
  if (command.kind === "launch") {
    return includesLoose(text, command.name) && includesLoose(text, command.symbol)
      && (!command.description || includesLoose(text, command.description))
      && (!command.website || text.includes(command.website))
      && (!command.twitter || text.includes(command.twitter))
      && (!command.telegram || text.includes(command.telegram))
      && (!command.devBuy || includesLoose(text, command.devBuy.amount));
  }
  return true;
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || raw;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(source.slice(start, end + 1)) as unknown; } catch { return null; }
}

function validateIntent(value: unknown, text: string): XWalletIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.kind === "irrelevant") return { kind: "irrelevant" };
  if (item.kind === "unknown_wallet") return { kind: "unknown_wallet" };
  if (item.kind === "help" && ["capabilities", "wallet", "fund", "balance", "send", "buy_sell", "burn", "launch", "fees"].includes(String(item.topic))) {
    return { kind: "help", topic: item.topic as WalletHelpTopic };
  }
  if (item.kind === "command") {
    const command = validateStructuredWalletCommand(item.command);
    if (!command || command.kind === "unknown" || !explicitAuthority(text, command) || !fieldsAreGrounded(text, command)) return { kind: "unknown_wallet" };
    return { kind: "command", command };
  }
  return null;
}

function deterministicFallback(text: string): XWalletIntent {
  const parsed = parseWalletCommand(text);
  if (parsed.kind !== "unknown") return { kind: "command", command: parsed };
  if (!WALLET_WORDS.test(text)) return { kind: "irrelevant" };
  if (/\bwhat\s+can\s+you\s+do|\bcommands?|\bfeatures?\b/i.test(text)) return { kind: "help", topic: "capabilities" };
  if (/\bhow\b|\bwhat\b|\bexplain\b|\bhelp\b/i.test(text)) {
    if (/\blaunch|plant|deploy|dev\s*buy\b/i.test(text)) return { kind: "help", topic: "launch" };
    if (/\bburn\b/i.test(text)) return { kind: "help", topic: "burn" };
    if (/\bbuy|sell|swap|slippage\b/i.test(text)) return { kind: "help", topic: "buy_sell" };
    if (/\bsend|transfer|give\b/i.test(text)) return { kind: "help", topic: "send" };
    if (/\bbalance\b/i.test(text)) return { kind: "help", topic: "balance" };
    if (/\bfund|deposit\b/i.test(text)) return { kind: "help", topic: "fund" };
    if (/\bclaim|fees?\b/i.test(text)) return { kind: "help", topic: "fees" };
    return { kind: "help", topic: "wallet" };
  }
  return { kind: "unknown_wallet" };
}

export async function parseXWalletIntent(text: string, hasImage: boolean): Promise<XWalletIntent> {
  const prompt = `You parse one direct X mention for a Robinhood Chain wallet bot. Return one JSON object only. Never write the reply.

Allowed intent shapes:
{"kind":"irrelevant"}
{"kind":"unknown_wallet"}
{"kind":"help","topic":"capabilities|wallet|fund|balance|send|buy_sell|burn|launch|fees"}
{"kind":"command","command":COMMAND}

COMMAND kinds and fields:
- create_wallet or show_wallet
- show_balance, optional token
- send: amount decimal string, unit eth|usd|token|percent, optional token, recipient @handle or 0x address
- burn: amount, unit usd|token|percent, token
- buy: amount, unit eth|usd, token, slippageBps integer (default 250)
- sell: amount, unit token|percent, token, slippageBps integer (default 250)
- claim_fees, optional token
- launch: launchMode curve, name, symbol, optional description, website, twitter, telegram, devBuy {amount,unit eth|usd}

Classify questions about abilities or instructions as help, never as commands. Classify a post with no wallet, trading, transfer, burn, fee, or launch purpose as irrelevant. A valid command may contain a greeting, politeness, a reason for the request, or unrelated commentary before or after it. Ignore that surrounding prose and extract the explicit command normally. Do not downgrade a clear command merely because extra text is present. If a post contains more than one distinct wallet action, return unknown_wallet rather than choosing one. Use unknown_wallet when the post is clearly about these wallet or launch features but required meaning is ambiguous or missing. A request for 'my wallet', 'wallet address', or where to fund is show_wallet, not a definition. Preserve 0x addresses exactly. Remove commas from numbers. Convert all/half/percent to unit percent and amount 100/50/value. Tickers may have a leading $; return them without $. Never infer a recipient, amount, token, launch name, or ticker. Launch name and symbol must be separately identified from labels, quotes, or clear grammar. Links must remain exact expanded HTTPS URLs. An attached image exists: ${hasImage ? "yes" : "no"}. Do not invent its URL. Burn is a command only if the exact word burn appears. The direct post alone is authoritative.`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await openRouter([{ role: "system", content: prompt }, { role: "user", content: text }], 350, {
        reasoningEffort: "high", minimumCompletionTokens: 1_500, timeoutMs: 30_000, providerSort: "latency", temperature: 0,
      });
      const intent = validateIntent(extractJson(raw), text);
      if (intent) return intent;
    } catch (error) {
      console.error("x_intent_parse_failed", { attempt: attempt + 1, message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return deterministicFallback(text);
}
