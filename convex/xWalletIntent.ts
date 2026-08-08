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
  const canonical = (input: string) => input.toLowerCase().replace(/^\$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  return canonical(text).includes(canonical(value));
}

function identifierIsGrounded(text: string, value: string) {
  const escaped = value.replace(/^\$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-zA-Z0-9])\\$?${escaped}(?=$|[^a-zA-Z0-9])`, "i").test(text);
}

function fieldsAreGrounded(text: string, command: WalletCommand) {
  if (command.kind === "send") {
    const amountGrounded = includesLoose(text, command.amount)
      || (command.unit === "percent" && command.amount === "100" && /\ball(?:\s+of)?\b/i.test(text))
      || (command.unit === "percent" && command.amount === "50" && /\bhalf(?:\s+of)?\b/i.test(text));
    return amountGrounded && includesLoose(text, command.recipient) && (!command.token || identifierIsGrounded(text, command.token));
  }
  if (command.kind === "burn" || command.kind === "buy" || command.kind === "sell") {
    const amountGrounded = includesLoose(text, command.amount)
      || (command.unit === "percent" && command.amount === "100" && /\ball(?:\s+of)?\b/i.test(text))
      || (command.unit === "percent" && command.amount === "50" && /\bhalf(?:\s+of)?\b/i.test(text));
    return amountGrounded && identifierIsGrounded(text, command.token);
  }
  if (command.kind === "claim_fees") return !command.token || identifierIsGrounded(text, command.token);
  if (command.kind === "show_balance") return !command.token || identifierIsGrounded(text, command.token);
  if (command.kind === "launch") {
    return includesLoose(text, command.name) && identifierIsGrounded(text, command.symbol)
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

type CommandKind = Exclude<WalletCommand, { kind: "unknown" }>["kind"];
type ClassifiedIntent =
  | { kind: "irrelevant" }
  | { kind: "unknown_wallet" }
  | { kind: "help"; topic: WalletHelpTopic }
  | { kind: "command"; command: CommandKind };

const HELP_TOPICS: WalletHelpTopic[] = ["capabilities", "wallet", "fund", "balance", "send", "buy_sell", "burn", "launch", "fees"];
const COMMAND_KINDS: CommandKind[] = ["create_wallet", "show_wallet", "show_balance", "send", "burn", "buy", "sell", "claim_fees", "launch"];

function validateClassification(value: unknown): ClassifiedIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.kind === "irrelevant") return { kind: "irrelevant" };
  if (item.kind === "unknown_wallet") return { kind: "unknown_wallet" };
  if (item.kind === "help" && HELP_TOPICS.includes(item.topic as WalletHelpTopic)) {
    return { kind: "help", topic: item.topic as WalletHelpTopic };
  }
  if (item.kind === "command" && COMMAND_KINDS.includes(item.command as CommandKind)) return { kind: "command", command: item.command as CommandKind };
  return null;
}

function validateExtractedCommand(value: unknown, expectedKind: CommandKind, text: string): WalletCommand | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const candidate = item.command && typeof item.command === "object" ? item.command : item;
  const command = validateStructuredWalletCommand(candidate);
  if (!command || command.kind === "unknown" || command.kind !== expectedKind) return null;
  if (!explicitAuthority(text, command) || !fieldsAreGrounded(text, command)) return null;
  return command;
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

function deterministicClassification(text: string): ClassifiedIntent {
  const fallback = deterministicFallback(text);
  if (fallback.kind !== "command") return fallback;
  return { kind: "command", command: fallback.command.kind as CommandKind };
}

async function classifyIntent(text: string): Promise<ClassifiedIntent> {
  const prompt = `Classify one direct X mention for a Robinhood Chain wallet bot. Determine intent only. Do not extract, repeat, or return amounts, names, tickers, contracts, recipients, links, images, or other parameters. Return exactly one JSON object and no prose.

Allowed outputs:
{"kind":"irrelevant"}
{"kind":"unknown_wallet"}
{"kind":"help","topic":"capabilities|wallet|fund|balance|send|buy_sell|burn|launch|fees"}
{"kind":"command","command":"create_wallet|show_wallet|show_balance|send|burn|buy|sell|claim_fees|launch"}

Use help for questions about what the bot can do or how a feature works. A request for the user's actual wallet, wallet address, balance, or funds is a command, even if phrased as a question. Use irrelevant when there is no wallet, trade, transfer, burn, fee, balance, or launch purpose. Use unknown_wallet when the message concerns these features but the intended action is unclear, or when it explicitly asks for multiple different actions. Greetings, reasons, jokes, and commentary may surround one command and should not hide it. Burn is a command only when the exact word burn appears. Analyze only this direct post.`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await openRouter([{ role: "system", content: prompt }, { role: "user", content: text }], 80, {
        reasoningEffort: "high", minimumCompletionTokens: 1_000, timeoutMs: 25_000, providerSort: "latency", temperature: 0,
      });
      const classified = validateClassification(extractJson(raw));
      if (classified) return classified;
    } catch (error) {
      console.error("x_intent_classification_failed", { attempt: attempt + 1, message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return deterministicClassification(text);
}

function extractionInstructions(kind: CommandKind, hasImage: boolean) {
  const common = `Return exactly one JSON object containing the command fields and no prose. Extract only values explicitly present in the direct post. Never invent or repair a missing amount, name, ticker, contract, recipient, link, or percentage. Remove commas from numeric amounts. Preserve 0x addresses exactly. The expected command kind is ${kind}; never return another kind.`;
  const instructions: Record<CommandKind, string> = {
    create_wallet: `Return {"kind":"create_wallet"}. Use this only for a request to create, open, make, or set up the user's wallet.`,
    show_wallet: `Return {"kind":"show_wallet"}. This includes flexible requests for the user's wallet, wallet address, deposit address, funding address, receiving address, or where to send ETH.`,
    show_balance: `Return {"kind":"show_balance"} with optional "token" only when a ticker or contract is explicitly requested. A general balance request has no token field.`,
    send: `Return {"kind":"send","amount":"...","unit":"eth|usd|token|percent","token":"... when required","recipient":"@handle or 0x address"}. Recognize send, transfer, and give. Amount, asset, and recipient may appear in any order. For all/half/XX%, use percent with 100/50/value. A USD amount applied to a token keeps that token. Do not confuse the bot mention with the recipient.`,
    burn: `Return {"kind":"burn","amount":"...","unit":"usd|token|percent","token":"..."}. The exact word burn must be present. Recognize token quantities, USD worth, all, half, and percentages. Never infer a burn from destroy, remove, or send.`,
    buy: `Return {"kind":"buy","amount":"...","unit":"eth|usd","token":"...","slippageBps":250}. Extract a custom slippage as percentage times 100, from 10 through 2000 basis points. Keep $ used as a USD prefix separate from $ used before a ticker.`,
    sell: `Return {"kind":"sell","amount":"...","unit":"token|percent","token":"...","slippageBps":250}. Recognize quantities, all, half, and percentages in flexible order. Extract a custom slippage as percentage times 100, from 10 through 2000 basis points.`,
    claim_fees: `Return {"kind":"claim_fees"} with optional "token" only when a ticker or contract is explicitly supplied. This is only for an explicit request to claim creator fees, revenue, or rewards.`,
    launch: `Return {"kind":"launch","launchMode":"curve","name":"...","symbol":"..."} plus optional description, website, twitter, telegram, and devBuy {amount,unit}. Name and ticker are required and may appear in any order. Recognize launch, plant, create, deploy, and sprout. Tickers may be SEED, $SEED, (SEED), ticker: SEED, symbol=$SEED, or written before the name. Remove a leading $ and uppercase the symbol. Names may be quoted or introduced by name, called, named, or call it. Do not mistake a dev-buy dollar amount, URL, X handle, bot mention, or ordinary capitalized word for the ticker. Preserve optional HTTPS links exactly. Dev buy may be USD or ETH. The separately supplied post has an attached image: ${hasImage ? "yes" : "no"}; images are optional and their URL is not part of this JSON.`,
  };
  return `${common}\n\n${instructions[kind]}`;
}

async function extractCommand(text: string, kind: CommandKind, hasImage: boolean): Promise<WalletCommand | null> {
  const prompt = extractionInstructions(kind, hasImage);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await openRouter([{ role: "system", content: prompt }, { role: "user", content: text }], kind === "launch" ? 400 : 220, {
        reasoningEffort: "high", minimumCompletionTokens: kind === "launch" ? 1_500 : 1_000,
        timeoutMs: 30_000, providerSort: "latency", temperature: 0,
      });
      const command = validateExtractedCommand(extractJson(raw), kind, text);
      if (command) return command;
    } catch (error) {
      console.error("x_parameter_extraction_failed", { kind, attempt: attempt + 1, message: error instanceof Error ? error.message : "unknown" });
    }
  }
  const fallback = parseWalletCommand(text);
  return fallback.kind === kind ? fallback : null;
}

export async function parseXWalletIntent(text: string, hasImage: boolean): Promise<XWalletIntent> {
  const classified = await classifyIntent(text);
  if (classified.kind !== "command") return classified;
  const command = await extractCommand(text, classified.command, hasImage);
  if (command) return { kind: "command", command };
  const fallback = parseWalletCommand(text);
  return fallback.kind === "unknown" ? { kind: "unknown_wallet" } : { kind: "command", command: fallback };
}
