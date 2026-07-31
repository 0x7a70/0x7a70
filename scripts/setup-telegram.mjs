import fs from "node:fs";

function readEnvFile(filename) {
  if (!fs.existsSync(filename)) return {};
  return Object.fromEntries(fs.readFileSync(filename, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }));
}

const local = readEnvFile(".env.local");
const token = process.env.TELEGRAM_BOT_TOKEN || local.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || local.TELEGRAM_WEBHOOK_SECRET;
const suppliedSite = process.argv[2];
const site = suppliedSite || process.env.NEXT_PUBLIC_SITE_URL || local.NEXT_PUBLIC_SITE_URL;

if (!token || !secret || !site) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, and a production site URL are required.");
  console.error("Usage: npm run telegram:setup -- https://your-production-domain.example");
  process.exit(1);
}

const base = `https://api.telegram.org/bot${token}`;
const meResponse = await fetch(`${base}/getMe`);
const me = await meResponse.json();
if (!me.ok) {
  console.error(`Telegram rejected the bot token: ${me.description || "unknown error"}`);
  process.exit(1);
}

const webhookUrl = `${site.replace(/\/$/, "")}/api/telegram/webhook`;
const webhookResponse = await fetch(`${base}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member"],
    drop_pending_updates: true,
  }),
});
const webhook = await webhookResponse.json();
if (!webhook.ok) {
  console.error(`Unable to register webhook: ${webhook.description || "unknown error"}`);
  process.exit(1);
}

console.log(`Telegram bot @${me.result.username} (${me.result.id}) is connected.`);
console.log(`Webhook: ${webhookUrl}`);
console.log(`Set TELEGRAM_BOT_USERNAME=${me.result.username} in Convex.`);
