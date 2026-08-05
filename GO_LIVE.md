# 0x7a70 single-cutover runbook

> Current operator override: the public Vercel site continues to use the
> existing Convex development deployment. Vercel runs `npm run build` only;
> updated Convex functions are pushed locally with `npx convex dev --once`.
> Do not create, seed, or switch to a separate Convex production deployment.

This runbook activates the complete public system in one coordinated cutover.
It does not authorize skipping preflight checks for irreversible mainnet wallet
operations. Keep all public execution flags false until the activation section.

## Confirmed operator decisions

- X approval for automated AI replies has been received.
- Coinbase CDP account-level policy enforcement is not required. The protected
  signer gateway remains the transaction policy boundary.
- Maximum native ETH value per transaction: `WALLET_MAX_TRANSACTION_USD=10000`.
- This is a per-transaction native-value ceiling, not a cumulative daily
  monetary ceiling. Existing daily wallet request-count limits remain active.

## Remaining hard blockers

- OAuth 1.0a credentials that post as `@0x7a70` and its immutable user ID.
- Coinbase CDP server-wallet credentials configured in Vercel Production.
- Funded OpenRouter account with an operator-selected hard credit limit.
- Final Vercel and Convex deployments and `https://0x7a70.wiki` DNS.
- Verified Robinhood Chain PotatoCurvePad and PotatoFeeLocker contracts.

## Convex Production configuration

- `CONVEX_SERVER_SECRET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_TEXT_MODEL`
- `NEXT_PUBLIC_SITE_URL=https://0x7a70.wiki`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME=the0x7a70bot`
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`
- `X_BOT_USER_ID`
- `WALLET_SIGNER_URL=https://0x7a70.wiki/api/wallet-signer`
- `WALLET_SIGNER_TOKEN`
- `ROBINHOOD_RPC_URL`
- `POTATOPAD_CURVE_ADDRESS=0xbE2aCD9044516399aa4C697c299571664fBe9d4B`
- the selected `X_REPLY_*` limits

Before activation, retain `X_REPLIES_ENABLED=false`,
`X_CRYPTO_EXECUTION_ENABLED=false`, and
`WALLET_FEATURE_PROMPTS_ENABLED=false`.

## Vercel Production configuration

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_SITE_URL=https://0x7a70.wiki`
- `CONVEX_DEPLOY_KEY`
- `CONVEX_SERVER_SECRET`, matching Convex
- `RATE_LIMIT_HMAC_SECRET`
- `TELEGRAM_WEBHOOK_SECRET`
- `WALLET_SIGNER_TOKEN`, matching Convex
- `WALLET_SIGNER_IDEMPOTENCY_SECRET`
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- `WALLET_MAX_TRANSACTION_USD=10000`
- `ROBINHOOD_RPC_URL`
- `X_CRYPTO_EXECUTION_ENABLED=false` before activation

Coinbase credentials must be scoped to Vercel Production only. Never expose
them to previews, Convex, browser variables, source control, or logs.

## Preflight

1. Freeze the release commit and record its hash.
2. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
3. Run a secret scan and dependency audit.
4. Confirm the Convex production schema is compatible with existing data.
5. Confirm `seed:status` reports the existing patch. Do not reseed it.
6. Inspect all scheduled functions and automation timestamps.
7. Validate X credentials identify `@0x7a70` and have read/write access.
8. Validate the Telegram token and production webhook secret.
9. Validate Coinbase wallet provisioning, immutable X ownership binding, and
   signer-gateway authorization.
10. Simulate every signer operation against chain 4663 and verified contracts,
    including a buy, first-sell exact approval, and the subsequent sell.
11. Confirm reconciliation, idempotency, gas reserve enforcement, launch vanity
    address verification, and creator-fee authorization.
12. Confirm launch receipts create one patch event and one Telegram announcement.

## Deploy while inert

1. Deploy Convex functions with all three public feature flags false.
2. Deploy the pinned commit to Vercel Production.
3. Register the Telegram webhook with
   `npm run telegram:setup -- https://0x7a70.wiki`.
4. Verify existing public features without accepting X replies or wallet actions.

## Single activation

At the agreed cutover time:

1. Set Convex `WALLET_FEATURE_PROMPTS_ENABLED=true`.
2. Set Convex `X_REPLIES_ENABLED=true`.
3. Set Convex `X_CRYPTO_EXECUTION_ENABLED=true`.
4. Set Vercel Production `X_CRYPTO_EXECUTION_ENABLED=true`.
5. Redeploy Vercel so the signer receives its execution flag.
6. Record the activation timestamp and configuration revision.

The one-minute Convex cron begins polling X after the reply flag changes. No
separate scheduler-start command is required.

## Immediate observation and rollback

Watch the first mention poll, ordinary reply, wallet request, wallet
provisioning, and launch reconciliation. If duplicate replies, unexpected
signing, ownership mismatch, or policy failure appears:

1. Set Convex `X_REPLIES_ENABLED=false`.
2. Set Convex and Vercel `X_CRYPTO_EXECUTION_ENABLED=false`.
3. Redeploy Vercel so the signer fails closed.
4. Preserve pending transaction records and logs. Do not delete prepared or
   broadcast records.
