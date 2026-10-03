/**
 * Keep crons/package.json AP pins aligned with the root lockfile and ci-deps.*.json.
 * ap-install-deps must run from repo root (workspace hoists node_modules there).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStage, syncCronsApPins } from "./lib/crons-ap-pins.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let stage;
try {
  stage = resolveStage();
} catch (err) {
  console.error("usage: node scripts/sync-crons-ap-deps.mjs [--stage dev|prod]");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const summary = syncCronsApPins(ROOT, stage);
console.log("sync-crons-ap-deps: updated crons/package.json from root lockfile", summary);
