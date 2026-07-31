# Potato Patch Operations

## Required production values

Set `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_SITE_URL` in Vercel. Set
`OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`, and
`CONVEX_SERVER_SECRET` on the Convex production deployment. Set the same
`CONVEX_SERVER_SECRET`, plus `RATE_LIMIT_HMAC_SECRET` and
`CONVEX_DEPLOY_KEY`, in Vercel.

Use independent, randomly generated values of at least 32 bytes for both
secrets. Never commit them.

## First launch

Deploy the application and Convex functions, then invoke
`seed:initialize` once with the production `CONVEX_SERVER_SECRET`. The
operation is idempotent: subsequent invocations report that initialization
already occurred. It creates all potatoes and hobbies and schedules the three
independent loops.

## Automation recovery

Check `seed:status` and the Convex scheduled-functions view. If state exists
but a loop no longer has a scheduled execution, use the Convex dashboard to
run its corresponding internal function once. Each successful run schedules
the next randomized execution.

Do not reseed production to recover a loop.

## AI and rate limits

The OpenRouter key must remain server-side. Change `OPENROUTER_TEXT_MODEL`
without changing application code. The default is `openai/gpt-oss-20b`.
Use prepaid OpenRouter credits with automatic top-up disabled and apply a
credit limit to the project key. When the balance or key limit is exhausted,
terminal requests use their existing in-world fallback and automated thoughts
resume normally at the next interval.
Terminal limits are enforced in `convex/ai.ts`: one second between messages
and 100 messages per hashed visitor/session per UTC day. Terminal generation
makes up to two attempts before returning its fallback. Interactive requests
use high reasoning with a moderated private token allowance and
throughput-prioritized provider routing; scheduled thoughts retain the larger
high-reasoning allowance. Automated thoughts use
a newly randomized interval of four to eight minutes after every run. Each run
durably schedules its successor before contacting the AI provider, so a failed
or invalid generation skips only that thought and does not stop the loop. A
thought may make up to ten generation attempts with a short capped backoff;
authentication, permission, and exhausted-credit errors stop retrying early.

Rotate either secret by updating Convex and Vercel together, then redeploy.
Existing terminal sessions may receive an in-world fallback during rotation.

## Telegram bot

The Telegram integration uses only `0x7a70`. It responds to every private text
message and to group messages that mention the bot or reply directly to one of
its messages. It retains at most six exchanges per user and chat as lightly
weighted continuity; the newest message always controls the response. New human
group members receive an AI-generated welcome based on 0x7a70's live
personality, corruption, and hobbies.

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` on the Convex deployment.
Set `TELEGRAM_WEBHOOK_SECRET` and `CONVEX_SERVER_SECRET` in Vercel. The webhook
secret must contain only letters, numbers, underscores, and hyphens. Keep the
BotFather token out of Git and browser-visible environment variables.

After deploying, register the production webhook from a trusted local shell:

```powershell
npm run telegram:setup -- https://your-production-domain.example
```

The script validates the token, registers `/api/telegram/webhook`, discards
old pending updates, and prints the exact `TELEGRAM_BOT_USERNAME` value to set
in Convex. Keep group privacy mode enabled in BotFather. Add the bot to the
group and mention it once; the group is registered automatically with thought
transmissions enabled. A dedicated 0x7a70 thought is then generated and sent
every 10–15 minutes. The next execution is durably scheduled before generation,
so a failed AI or Telegram request does not stop the loop.

To stop group thoughts without removing the bot, set `thoughtsEnabled` to
`false` for that chat in the `telegramChats` table. Removing the bot also
disables the group when Telegram delivers the membership update.

## Deployment

Vercel runs the configured Convex deployment command before the Next.js
production build. Preview deployments should use a Convex preview deploy key;
production uses the existing production deployment. Promote only after the
patch, one potato page, one hobby page, and one terminal request pass smoke
testing.
