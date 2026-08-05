export type AmountUnit = "eth" | "usd" | "token" | "percent";

export type WalletCommand =
  | { kind: "create_wallet" }
  | { kind: "show_wallet" }
  | { kind: "show_balance"; token?: string }
  | { kind: "send"; amount: string; unit: AmountUnit; token?: string; recipient: string }
  | { kind: "burn"; amount: string; unit: AmountUnit; token: string }
  | { kind: "buy"; amount: string; unit: "eth" | "usd"; token: string; slippageBps: number }
  | { kind: "sell"; amount: string; unit: "token" | "percent"; token: string; slippageBps: number }
  | { kind: "claim_fees"; token?: string }
  | {
      kind: "launch";
      launchMode: "curve";
      name: string;
      symbol: string;
      description?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      devBuy?: { amount: string; unit: "eth" | "usd" };
    }
  | { kind: "unknown"; reason: string };

const ADDRESS = /0x[a-fA-F0-9]{40}/;
const NUMBER = "([0-9]+(?:\\.[0-9]+)?)";
export const DEFAULT_SWAP_SLIPPAGE_BPS = 250;
export const MAX_LAUNCH_DEV_BUY_ETH = 0.02627;

function slippageBps(text: string) {
  const match = text.match(/\bslippage\s*(?:is|=|:|of|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i)
    || text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*%\s+slippage\b/i);
  if (!match) return DEFAULT_SWAP_SLIPPAGE_BPS;
  const bps = Math.round(Number(match[1]) * 100);
  return Number.isFinite(bps) && bps >= 10 && bps <= 2_000 ? bps : -1;
}

function tradeToken(text: string, verb: "buy" | "sell") {
  const afterOf = text.match(new RegExp(`\\b${verb}\\b[\\s\\S]*?\\bof\\s+\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"))?.[1];
  const address = text.match(ADDRESS)?.[0];
  const ticker = text.match(new RegExp(`\\b${verb}\\s+(?:\\$?[0-9]+(?:\\.[0-9]+)?\\s*(?:usd|dollars?|eth|weth)?\\s+(?:of\\s+)?)?\\$([a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"))?.[1];
  const direct = text.match(new RegExp(`\\b${verb}\\s+[0-9]+(?:\\.[0-9]+)?\\s+\\$?(0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"))?.[1];
  return afterOf || address || ticker || direct;
}

function percentageAsset(text: string, verb: "send" | "sell" | "burn") {
  const verbPattern = verb === "send" ? "(?:send|transfer|give)" : verb;
  const match = text.match(new RegExp(`\\b${verbPattern}\\s+(all|half|[0-9]+(?:\\.[0-9]{1,4})?\\s*%)\\s+(?:of\\s+)?my\\s+\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"));
  if (!match) return undefined;
  const amount = /^all$/i.test(match[1]) ? "100" : /^half$/i.test(match[1]) ? "50" : match[1].replace(/\s*%$/, "");
  const numeric = Number(amount);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 100 ? { amount, token: match[2] } : null;
}

function cleanSymbol(value: string) {
  return value.replace(/^\$/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
}

function labeledUrl(text: string, labels: string) {
  return text.match(new RegExp(`\\b(?:${labels})\\s*(?:is|=|:)?\\s*(https:\\/\\/[^\\s,;]+)`, "i"))?.[1]
    ?.replace(/[.)]+$/, "");
}

function quotedField(text: string, label: string, maxLength: number) {
  const quoted = text.match(new RegExp(`\\b(?:${label})\\s*(?:is|=|:)?\\s*["“]([^"”]+)["”]`, "i"))?.[1];
  const plain = text.match(new RegExp(`\\b(?:${label})\\s*(?:is|=|:)+\\s*([^;]+?)(?=\\s+\\b(?:website|site|x|twitter|telegram|tg)\\b\\s*(?:is|=|:)|\\s+\\bdev\\s*buy\\b|$)`, "i"))?.[1];
  const value = (quoted || plain || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return value ? value.slice(0, maxLength) : undefined;
}

function parseLaunch(text: string): WalletCommand | null {
  if (!/\b(?:plant|launch|create|deploy|sprout)\b/i.test(text) || !/\b(?:token|coin|ticker|symbol|plant)\b/i.test(text)) return null;
  const symbolMatch = text.match(/\b(?:ticker|symbol)\s*(?:is|=|:)?\s*\$?([a-zA-Z0-9]{1,12})\b/i)
    || text.match(/\$([a-zA-Z][a-zA-Z0-9]{0,11})\b/);
  const quotedName = text.match(/\b(?:called|named|name)\s*(?:is|=|:)?\s*["“]([^"”]{1,48})["”]/i)?.[1]
    || text.match(/\b(?:plant|launch|create|deploy|sprout)\s+(?:a\s+)?(?:token|coin)?\s*["“]([^"”]{1,48})["”]/i)?.[1];
  const namedName = text.match(/\b(?:called|named|name)\s+(?:is\s+)?([^,.;]+?)(?=\s+(?:with|ticker|symbol|using|and\b|dev\s*buy)|[,.;]|$)/i)?.[1];
  const plantName = text.match(/\b(?:plant|launch|create|deploy|sprout)\s+(?:a\s+)?(?:token|coin)?\s*(?:called|named)?\s*([^,.;]+?)(?=\s+(?:with|ticker|symbol|using|and\b|dev\s*buy)|[,.;]|$)/i)?.[1];
  const name = (quotedName || namedName || plantName || "").trim().replace(/^(?:a|the)\s+/i, "").slice(0, 48);
  const symbol = cleanSymbol(symbolMatch?.[1] || "");
  if (!name || !symbol) return { kind: "unknown", reason: "A launch needs both a name and a ticker." };

  const description = quotedField(text, "description|desc", 280);
  const website = labeledUrl(text, "website|site");
  const twitter = labeledUrl(text, "x|twitter");
  const telegram = labeledUrl(text, "telegram|tg");

  const usdBuy = text.match(new RegExp(`(?:dev\\s*buy|buy)[^$0-9]{0,16}\\$${NUMBER}`, "i"));
  const ethBuy = text.match(new RegExp(`(?:dev\\s*buy|buy)[^0-9]{0,16}${NUMBER}\\s*(?:eth|weth)\\b`, "i"));
  const leadingUsdBuy = text.match(new RegExp(`\\$${NUMBER}[^,.;]{0,16}(?:dev\\s*buy|buy)`, "i"));
  const leadingEthBuy = text.match(new RegExp(`${NUMBER}\\s*(?:eth|weth)[^,.;]{0,16}(?:dev\\s*buy|buy)`, "i"));
  const parsedEthBuy = ethBuy || leadingEthBuy;
  if (parsedEthBuy && Number(parsedEthBuy[1]) > MAX_LAUNCH_DEV_BUY_ETH) {
    return { kind: "unknown", reason: "The maximum initial dev buy is 0.02627 ETH." };
  }
  return {
    kind: "launch",
    launchMode: "curve",
    name,
    symbol,
    ...(description ? { description } : {}),
    ...(website ? { website } : {}),
    ...(twitter ? { twitter } : {}),
    ...(telegram ? { telegram } : {}),
    ...(usdBuy || leadingUsdBuy ? { devBuy: { amount: (usdBuy || leadingUsdBuy)![1], unit: "usd" as const } }
      : parsedEthBuy ? { devBuy: { amount: parsedEthBuy[1], unit: "eth" as const } } : {}),
  };
}

export function parseWalletCommand(raw: string): WalletCommand {
  const recipientHandle = /\b(?:send|transfer|give)\b/i.test(raw)
    ? raw.match(/\bto\s+(@[a-zA-Z0-9_]{1,15})\b/i)?.[1]
      || raw.match(/\b(?:send|transfer|give)\s+(@(?!0x7a70\b)[a-zA-Z0-9_]{1,15})\b/i)?.[1]
    : undefined;
  const text = raw.replace(/@[a-zA-Z0-9_]{1,15}/g, " ").replace(/\s+/g, " ").trim();
  const launch = parseLaunch(text);
  if (launch) return launch;
  if (/\bbuy\b/i.test(text)) {
    const token = tradeToken(text, "buy");
    const usd = text.match(new RegExp(`\\$${NUMBER}|${NUMBER}\\s*(?:usd|dollars?)\\b`, "i"));
    const eth = text.match(new RegExp(`${NUMBER}\\s*(?:eth|weth)\\b`, "i"));
    const slippage = slippageBps(text);
    if (slippage < 0) return { kind: "unknown", reason: "Slippage must be between 0.1% and 20%." };
    if (!token || (!usd && !eth)) return { kind: "unknown", reason: "A buy needs an ETH or USD amount and a token ticker or contract address." };
    return { kind: "buy", amount: (usd ? usd[1] || usd[2] : eth![1]), unit: usd ? "usd" : "eth", token, slippageBps: slippage };
  }
  if (/\bsell\b/i.test(text)) {
    const percentage = percentageAsset(text, "sell");
    if (percentage === null) return { kind: "unknown", reason: "A percentage must be greater than 0% and no more than 100%." };
    const token = tradeToken(text, "sell");
    const amount = text.match(new RegExp(`\\bsell\\s+${NUMBER}`, "i"))?.[1];
    const slippage = slippageBps(text);
    if (slippage < 0) return { kind: "unknown", reason: "Slippage must be between 0.1% and 20%." };
    if (percentage) return { kind: "sell", amount: percentage.amount, unit: "percent", token: percentage.token, slippageBps: slippage };
    if (!token || !amount) return { kind: "unknown", reason: "A sell needs a token amount and a token ticker or contract address." };
    return { kind: "sell", amount, unit: "token", token, slippageBps: slippage };
  }
  if (/\b(?:make|create|open|get)\b.*\bwallet\b|\bnew wallet\b/i.test(text)) return { kind: "create_wallet" };
  if (/\b(?:wallet address|deposit address|my address|show wallet)\b/i.test(text)) return { kind: "show_wallet" };
  if (/\b(?:balance|how much.*(?:eth|token|coin)|funds)\b/i.test(text)) {
    const token = text.match(/\b(?:of|for)\s+\$?([a-zA-Z0-9]{1,42})\b/i)?.[1];
    return { kind: "show_balance", ...(token ? { token } : {}) };
  }
  const recipient = /\b(?:send|transfer|give)\b/i.test(text) ? text.match(ADDRESS)?.[0] || recipientHandle : undefined;
  if (recipient) {
    const percentage = percentageAsset(text, "send");
    if (percentage === null) return { kind: "unknown", reason: "A percentage must be greater than 0% and no more than 100%." };
    if (percentage) return { kind: "send", amount: percentage.amount, unit: "percent", token: percentage.token, recipient };
    const usd = text.match(new RegExp(`\\$${NUMBER}|${NUMBER}\\s*(?:usd|dollars?)\\b`, "i"));
    const eth = text.match(new RegExp(`${NUMBER}\\s*(?:eth|weth)\\b`, "i"));
  const token = text.match(new RegExp(`${NUMBER}\\s+\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,11})\\b`, "i"));
   if (usd) return { kind: "send", amount: usd[1] || usd[2], unit: "usd", recipient };
    if (eth) return { kind: "send", amount: eth[1], unit: "eth", recipient };
    if (token) return { kind: "send", amount: token[1], unit: "token", token: cleanSymbol(token[2]), recipient };
  }
  const percentageBurn = percentageAsset(text, "burn");
  if (percentageBurn === null) return { kind: "unknown", reason: "A percentage must be greater than 0% and no more than 100%." };
  if (percentageBurn) return { kind: "burn", amount: percentageBurn.amount, unit: "percent", token: percentageBurn.token };
  const usdBurn = text.match(new RegExp(`\\bburn\\s+\\$${NUMBER}\\s+(?:worth\\s+)?(?:of\\s+)?\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"))
    || text.match(new RegExp(`\\bburn\\s+${NUMBER}\\s*(?:usd|dollars?)\\s+(?:worth\\s+)?(?:of\\s+)?\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"));
  if (usdBurn) return { kind: "burn", amount: usdBurn[1], unit: "usd", token: usdBurn[2] };
  const burn = text.match(new RegExp(`\\bburn\\s+${NUMBER}\\s*\\$?(0x[a-fA-F0-9]{40}|0x7a70|[a-zA-Z][a-zA-Z0-9]{0,31})\\b`, "i"));
  if (burn) return { kind: "burn", amount: burn[1], unit: "token", token: burn[2] };
  if (/\bclaim\b.*\b(?:fee|fees|revenue|rewards)\b/i.test(text)) {
    const address = text.match(ADDRESS)?.[0];
    const symbol = text.match(/\$([a-zA-Z][a-zA-Z0-9]{0,11})/)?.[1];
    return { kind: "claim_fees", ...(address || symbol ? { token: address || symbol } : {}) };
  }
  return { kind: "unknown", reason: "No supported wallet command was found." };
}

export function isValueMovingCommand(command: WalletCommand) {
  return command.kind === "send" || command.kind === "burn" || command.kind === "buy" || command.kind === "sell" || command.kind === "launch" || command.kind === "claim_fees";
}
