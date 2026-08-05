import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh 0x7a70 burn telemetry",
  { minutes: 10 },
  internal.automation.refreshBurnTelemetry,
);

crons.interval(
  "keep potato works growing",
  { minutes: 1 },
  internal.ai.ensureWorkLoop,
);

// Safe to deploy before approval: the action exits without contacting X until
// X_REPLIES_ENABLED is explicitly set to true in the Convex environment.
crons.interval(
  "poll direct X mentions",
  { minutes: 1 },
  internal.xReplies.pollMentions,
);

export default crons;
