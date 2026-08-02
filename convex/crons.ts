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

export default crons;
