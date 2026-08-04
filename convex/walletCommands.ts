export type AmountUnit = "eth" | "usd" | "token";

export type WalletCommand =
  | { kind: "create_wallet" }
  | { kind: "show_wallet" }
  | { kind: "show_balance"; token?: string }
  | { kind: "send"; amount: string; unit: AmountUnit; token?: string; recipient: string }
  | { kind: "burn"; amount: string; unit: AmountUnit; token: string }
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
      : ethBuy || leadingEthBuy ? { devBuy: { amount: (ethBuy || leadingEthBuy)![1], unit: "eth" as const } } : {}),
  };
}

export function parseWalletCommand(raw: string): WalletCommand {
  const text = raw.replace(/@[a-zA-Z0-9_]{1,15}/g, " ").replace(/\s+/g, " ").trim();
  const launch = parseLaunch(text);
  if (launch) return launch;
  if (/\b(?:make|create|open|get)\b.*\bwallet\b|\bnew wallet\b/i.test(text)) return { kind: "create_wallet" };
  if (/\b(?:wallet address|deposit address|my address|show wallet)\b/i.test(text)) return { kind: "show_wallet" };
  if (/\b(?:balance|how much.*(?:eth|token|coin)|funds)\b/i.test(text)) {
    const token = text.match(/\b(?:of|for)\s+\$?([a-zA-Z0-9]{1,42})\b/i)?.[1];
    return { kind: "show_balance", ...(token ? { token } : {}) };
  }
  const recipient = /\b(?:send|transfer|give)\b/i.test(text) ? text.match(ADDRESS)?.[0] : undefined;
  if (recipient) {
    const usd = text.match(new RegExp(`\\$${NUMBER}|${NUMBER}\\s*(?:usd|dollars?)\\b`, "i"));
    const eth = text.match(new RegExp(`${NUMBER}\\s*(?:eth|weth)\\b`, "i"));
    const token = text.match(new RegExp(`${NUMBER}\\s+\\$?([a-zA-Z][a-zA-Z0-9]{0,11})\\b`, "i"));
    if (usd) return { kind: "send", amount: usd[1] || usd[2], unit: "usd", recipient };
    if (eth) return { kind: "send", amount: eth[1], unit: "eth", recipient };
    if (token) return { kind: "send", amount: token[1], unit: "token", token: cleanSymbol(token[2]), recipient };
  }
  const burn = text.match(new RegExp(`\\bburn\\s+\\$?${NUMBER}\\s*([a-zA-Z][a-zA-Z0-9]{0,41})`, "i"));
  if (burn) return { kind: "burn", amount: burn[1], unit: "token", token: burn[2] };
  if (/\bclaim\b.*\b(?:fee|fees|revenue|rewards)\b/i.test(text)) {
    const address = text.match(ADDRESS)?.[0];
    const symbol = text.match(/\$([a-zA-Z][a-zA-Z0-9]{0,11})/)?.[1];
    return { kind: "claim_fees", ...(address || symbol ? { token: address || symbol } : {}) };
  }
  return { kind: "unknown", reason: "No supported wallet command was found." };
}

export function isValueMovingCommand(command: WalletCommand) {
  return command.kind === "send" || command.kind === "burn" || command.kind === "launch" || command.kind === "claim_fees";
}
