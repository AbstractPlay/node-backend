/**
 * Workspaces hoist @abstractplay/* at the repo root. A stale package-lock entry for
 * crons/node_modules/@abstractplay/* makes `npm ci` install an old copy that Vitest
 * (cwd crons/) resolves before the hoisted tree. Run after sync-crons-ap-deps.
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

function writeLock(lock) {
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

function stripNestedApLockEntries(lock) {
  const keys = nestedApLockfileKeys(lock);
  if (keys.length === 0) {
    return false;
  }
  for (const key of keys) {
    delete lock.packages[key];
  }
  return true;
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

function reconcile() {
  let lock = readLock();
  const stripped = stripNestedApLockEntries(lock);
  if (stripped) {
    writeLock(lock);
    console.log("prune-crons-nested-ap-deps: removed nested @abstractplay entries from package-lock.json");
  }
  removeNestedOnDisk();
  execSync("npm install", { cwd: ROOT, stdio: "inherit" });
}

const needsReconcile =
  nestedApLockfileKeys(readLock()).length > 0 || fs.existsSync(CRONS_NESTED_AP);

if (needsReconcile) {
  console.log("prune-crons-nested-ap-deps: reconciling workspace");
  reconcile();
  if (
    nestedApLockfileKeys(readLock()).length > 0 ||
    fs.existsSync(CRONS_NESTED_AP)
  ) {
    console.log("prune-crons-nested-ap-deps: second pass");
    reconcile();
  }
}

assertHoisted();
console.log("prune-crons-nested-ap-deps: OK (hoisted @abstractplay only)");
