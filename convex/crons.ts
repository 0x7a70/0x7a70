import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh 0x7a70 burn telemetry",
  { minutes: 10 },
  internal.automation.refreshBurnTelemetry,
);

export default crons;
