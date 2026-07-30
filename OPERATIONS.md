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
Terminal limits are enforced in `convex/ai.ts`: five seconds between messages
and 100 messages per hashed visitor/session per UTC day. Automated thoughts run
once every 15 minutes.

Rotate either secret by updating Convex and Vercel together, then redeploy.
Existing terminal sessions may receive an in-world fallback during rotation.

## Deployment

Vercel runs the configured Convex deployment command before the Next.js
production build. Preview deployments should use a Convex preview deploy key;
production uses the existing production deployment. Promote only after the
patch, one potato page, one hobby page, and one terminal request pass smoke
testing.
