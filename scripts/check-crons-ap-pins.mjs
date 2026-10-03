/**
 * Fail when crons/package.json @abstractplay/* pins drift from root package.json.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCronsApPinMismatches } from "./lib/crons-ap-pins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mismatches = findCronsApPinMismatches(ROOT);

if (mismatches.length === 0) {
  process.exit(0);
}

console.error("crons/package.json AP pins are out of sync with root package.json:");
for (const { pkg, expected, actual } of mismatches) {
  console.error(`  ${pkg}: crons has ${actual ?? "(missing)"}, root expects ${expected}`);
}
console.error(
  "Run: node scripts/sync-crons-ap-deps.mjs --stage dev  (or prod on main)",
);
process.exit(1);
