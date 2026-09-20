/**
 * Workspaces hoist @abstractplay/* at the repo root. A stale package-lock entry for
 * crons/node_modules/@abstractplay/* makes `npm ci` install an old copy that Vitest
 * (cwd crons/) resolves before the hoisted tree. Run after ap-install-deps.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRONS_NESTED_AP = path.join(ROOT, "crons", "node_modules", "@abstractplay");
const LOCK_PATH = path.join(ROOT, "package-lock.json");

function nestedApLockfileKeys(lock) {
  return Object.keys(lock.packages ?? {}).filter((key) =>
    key.startsWith("crons/node_modules/@abstractplay/"),
  );
}

function readLock() {
  return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
}

function removeNestedOnDisk() {
  if (!fs.existsSync(CRONS_NESTED_AP)) {
    return false;
  }
  fs.rmSync(CRONS_NESTED_AP, { recursive: true, force: true });
  console.log("prune-crons-nested-ap-deps: removed crons/node_modules/@abstractplay");
  return true;
}

function assertHoisted() {
  const lock = readLock();
  const nestedKeys = nestedApLockfileKeys(lock);
  if (fs.existsSync(CRONS_NESTED_AP) || nestedKeys.length > 0) {
    console.error("prune-crons-nested-ap-deps: nested @abstractplay still present", {
      onDisk: fs.existsSync(CRONS_NESTED_AP),
      lockfileKeys: nestedKeys,
    });
    process.exit(1);
  }
}

const hadNestedLockEntries = nestedApLockfileKeys(readLock()).length > 0;
const removedOnDisk = removeNestedOnDisk();

if (hadNestedLockEntries || removedOnDisk) {
  console.log("prune-crons-nested-ap-deps: reconciling workspace with npm install", {
    hadNestedLockEntries,
    removedOnDisk,
  });
  execSync("npm install", { cwd: ROOT, stdio: "inherit" });
}

assertHoisted();
console.log("prune-crons-nested-ap-deps: OK (hoisted @abstractplay only)");
