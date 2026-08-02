import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const envFile = fs.readFileSync(".env.local", "utf8");
const secretLine = envFile.split(/\r?\n/).reverse().find((line) => line.startsWith("CONVEX_SERVER_SECRET="));
const secret = secretLine?.slice("CONVEX_SERVER_SECRET=".length).trim();
if (!secret) {
  console.error("CONVEX_SERVER_SECRET is missing from .env.local");
  process.exit(1);
}

const convexCli = path.resolve("node_modules", "convex", "bin", "main.js");
const production = process.argv.includes("--prod");
const result = spawnSync(
  process.execPath,
  ["--use-system-ca", convexCli, "run", "seed:createWorkNow", JSON.stringify({ secret }), ...(production ? ["--prod"] : [])],
  { stdio: "inherit" },
);
if (result.error) console.error("Unable to schedule a work:", result.error.message);
process.exit(result.status ?? 1);
