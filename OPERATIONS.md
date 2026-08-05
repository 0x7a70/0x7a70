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
every 45-60 minutes. The next execution is durably scheduled before generation,
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

## X replies and X-linked wallets

The reply and wallet infrastructure is deliberately inert by default.
`X_REPLIES_ENABLED` and `X_CRYPTO_EXECUTION_ENABLED` default to `false`. A
one-minute cron invokes `xReplies:pollMentions`, but the action exits before
contacting X while replies are disabled. Do not enable either flag until X has
granted written approval and the signing service has completed security review.

Mention polling requests up to 100 records per page and follows pagination for
up to 1,000 records in one run. It advances the durable `since_id` cursor only
after every fetched page has been processed. A backlog beyond that bound fails
without advancing the cursor, allowing the next run to retry without skipping
mentions. A two-minute lease prevents overlapping cron invocations.

The 1,000-record value is only an exceptional backlog ceiling, not a reply
allowance. A normal one-minute poll makes one request for at most 100 records.
Reply admission remains governed by the configured per-user and global limits.

Launch authorization requires X verification. There is no separate manual
launch allowlist; any account reported as verified by X can submit a launch
command, subject to the normal execution flag, limits, and signer policies.

An X post containing `do not reply` (including `(do not reply)`, matched without
regard to case or repeated spaces) is discarded before any reply, AI request,
wallet provisioning, or wallet action. Reply processing uses only the direct
post's text and never supplies its parent or wider thread as context.

Direct questions about how wallet, transaction, burn, fee-claim, dev-buy, and
PotatoPad launch mechanics work are routed to a factual information response
before command parsing. The response is grounded in a fixed capability sheet,
uses only the direct post, and cannot authorize a wallet action.

Direct X interactions use two routes. Wallet questions and recognized wallet
commands enter the factual wallet route; every other qualifying direct mention
enters the general 0x7a70 conversation route, which uses the live personality,
corruption, and hobbies with no thread memory. The worker ignores its own X user
ID and deduplicates every source post ID.

Reply admission is enforced atomically before AI generation or wallet work. The
defaults are 30 accepted interactions per user per UTC day, 250 globally per UTC
day, 5 per user and 25 globally in a rolling 10-minute window, and one accepted
interaction per user every 30 seconds. Rate-limited posts receive no reply. Adjust
these with `X_REPLY_USER_DAILY_LIMIT`, `X_REPLY_GLOBAL_DAILY_LIMIT`,
`X_REPLY_USER_WINDOW_LIMIT`, `X_REPLY_GLOBAL_WINDOW_LIMIT`,
`X_REPLY_WINDOW_MINUTES`, and `X_REPLY_COOLDOWN_SECONDS`.

Wallet and launch facts are shared across the website terminal, Telegram user
replies, and X user replies, but the prompt block is disabled unless
`WALLET_FEATURE_PROMPTS_ENABLED=true`. Leave the example setting commented out
until the wallet feature is publicly launched. Enabling prompt information does
not enable execution; `X_REPLIES_ENABLED` and `X_CRYPTO_EXECUTION_ENABLED` remain
separate controls.

Wallet private keys must never enter Convex, Vercel, application logs, or local
environment files. Coinbase CDP holds the key material. Its API key ID, API key
secret, and wallet secret live only in Vercel's encrypted server environment;
they are never `NEXT_PUBLIC` variables and are not copied to Convex. Convex
stores only the CDP wallet's public address as its opaque reference.

The built-in authenticated gateway is mounted at `/api/wallet-signer`. In
production set Convex `WALLET_SIGNER_URL` to
`https://0x7a70.wiki/api/wallet-signer` and give Vercel and Convex the same
random `WALLET_SIGNER_TOKEN`. Vercel additionally requires:

- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET`;
- `WALLET_SIGNER_IDEMPOTENCY_SECRET`, a separate random 32-byte-or-longer value;
- `WALLET_MAX_TRANSACTION_USD`, an explicit fail-closed per-transaction ceiling;
- optionally `ROBINHOOD_RPC_URL`; otherwise the official mainnet RPC is used.

Scope every CDP credential and wallet secret to Vercel Production only. Preview
deployments must not receive them. The gateway also refuses CDP operations when
Vercel reports any environment other than `production`.

The gateway provides these authenticated operations:

- `POST /v1/wallets`: idempotently provision one chain-4663 wallet for an X user.
- `POST /v1/wallets/balance`: return a display balance after resolving an exact
  contract; reject ambiguous tickers.
- `POST /v1/transactions/execute`: simulate, enforce policy, and sign without
  broadcasting. Convex durably stores the signed transaction and deterministic
  transaction hash before the next phase begins.
- `POST /v1/transactions/broadcast`: verify the stored signed transaction and
  its owner, submit that exact transaction, and inspect a prompt receipt when
  available.
- `POST /v1/transactions/status`: reconcile a submitted transaction and verify
  its sender, value, receipt status, and launch events where relevant.

Successful X wallet responses include the confirmed transaction's public
Robinhood Chain Blockscout URL (`https://robinhoodchain.blockscout.com/tx/<hash>`).
Idempotent replays of an already-confirmed request return the same URL.

The request is stored as `prepared` before broadcast. If a receipt is not
available promptly, it becomes `broadcast`; Convex then checks it again with
bounded exponential backoff until it confirms or reverts. Never delete prepared
or broadcast records during a deployment or secret rotation.

The signer must independently enforce the expected source address, chain ID
4663, per-user ownership, daily/value limits, idempotency key, contract
allowlist, exact approvals, and operation allowlist. It must reject arbitrary
calldata. USD conversions happen there using a trusted, expiring quote; the AI
never performs financial arithmetic.

There is no fixed post-transaction ETH reserve. The signer still verifies that
the wallet can pay the current transaction's maximum estimated gas. When a user
requests all ETH, the signer subtracts that transaction's estimated maximum gas
cost and transfers the remainder. Other transactions fail with a funding
message when the wallet cannot cover both the requested value and current gas.

Supported operation types are `eth_transfer`, `erc20_transfer`,
`erc20_burn_to_dead`, `erc20_approve_router`, `uniswap_v3_buy`,
`uniswap_v3_sell`, `potatopad_launch`, and `potatopad_creator_fee_claim`.
ERC-20 burns accept either a direct token quantity or a USD-denominated amount.
For a USD burn, the signer converts USD to target WETH using its fresh ETH/USD
quote, obtains the required token input through the verified V3 exact-output
quoter, and transfers that calculated token quantity to the fixed dead address.
Token sends, sells, and burns also accept `all`, `half`, or an explicit
percentage from greater than zero through 100%. The signer calculates the raw
amount from the live token balance at execution time. Percentage operations do
not use AI arithmetic or a previously cached balance.
Normal swaps use exact input and default to 2.5% maximum slippage; an X command
may explicitly select 0.1% through 20%. Sell approvals are exact-amount and
restricted to the verified router. When approval is needed, the approval is
submitted first and the user must repeat the sell after it confirms.

The verified Robinhood Chain swap contracts are:

- router: `0xcaf681a66d020601342297493863e78c959e5cb2`
- quoter: `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`
- WETH: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- pool fee tier: `10000` (1%)

The verified curve pad is
`0xbE2aCD9044516399aa4C697c299571664fBe9d4B`. Launches call its initial,
payable `createToken(name,symbol,meta,salt)` entry point and attach the dev-buy
value atomically. Initial dev buys have a hard maximum of `0.02627 ETH`. USD
amounts are converted using the execution-time ETH quote and must remain below
the same wei-denominated cap. They do not call `bond()`; bonding is a later
curve milestone.

The launch salt is not merely random. The signer deterministically searches
candidate salts using the verified token factory's `initCodeHash` and the exact
CREATE2 calculation performed by PotatoCurvePad until it finds an unused address
whose first four hexadecimal characters are `7a70`. It verifies that neither
code nor a PotatoPad V3 pool already occupies the prediction. Launch receipts
are rejected unless the emitted token address begins with `0x7a70`.

Creator fee claims use the verified PotatoCurvePad at
`0xbE2aCD9044516399aa4C697c299571664fBe9d4B` and its on-chain `curves(token)`
record to resolve the creator and LP position. The pad's immutable `locker()`
and the locker's reciprocal `pad()` must match the verified PotatoFeeLocker at
`0x47eC8916647007c66985aa316f70C44Dd41D75EB`. The signer also verifies the
locker's position creator, current beneficiary, and WETH/token pair before
calling `collectAndClaim(positionId)`. Confirmation requires a matching
`FeesCollected` event whose caller is the requesting wallet; any emitted
`FeesClaimed` event must name that same wallet as beneficiary.

Keep `X_CRYPTO_EXECUTION_ENABLED=false` through provisioning and read-only
balance tests. Turning it on authorizes real irreversible mainnet transactions;
it is not a health-check switch.

For an X launch, `imageURI` is the HTTPS `pbs.twimg.com` URL returned for the
attached photo. PotatoPad's formatter explicitly renders plain HTTPS image
URLs. Only media URLs supplied by X's attachment expansion are accepted; a
URL typed into post text is not trusted as token artwork. This avoids another
upload service, but unlike IPFS the image is not content-addressed and could
become unavailable if X removes or changes the media.
