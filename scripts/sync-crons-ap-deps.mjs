/**
 * Keep crons/package.json and crons/ci-deps.* aligned with the root lockfile.
 * ap-install-deps must run from repo root (workspace hoists node_modules there).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLockfileVersions } from "@abstractplay/ap-deps-tools/lockfile-versions";

const AP = {
  gameslib: "@abstractplay/gameslib",
  renderer: "@abstractplay/renderer",
  recranks: "@abstractplay/recranks",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CRONS_ROOT = path.join(ROOT, "crons");

const stage = process.argv.includes("--stage")
  ? process.argv[process.argv.indexOf("--stage") + 1]
  : "dev";

if (stage !== "dev" && stage !== "prod") {
  console.error("usage: node scripts/sync-crons-ap-deps.mjs [--stage dev|prod]");
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const rootManifest = readJson(path.join(ROOT, `ci-deps.${stage}.json`));
const lockVersions = getLockfileVersions(ROOT, Object.values(AP));

const cronsPkgPath = path.join(CRONS_ROOT, "package.json");
const cronsPkg = readJson(cronsPkgPath);
cronsPkg.dependencies = cronsPkg.dependencies ?? {};

for (const pkg of Object.values(AP)) {
  const key = pkg.split("/").pop();
  const version = lockVersions[pkg] ?? rootManifest[key];
  if (version && pkg in cronsPkg.dependencies) {
    cronsPkg.dependencies[pkg] = version;
  }
}
writeJson(cronsPkgPath, cronsPkg);

const out = {
  updatedAt: new Date().toISOString(),
  source: rootManifest.source ?? `sync-crons-ap-deps from ${stage}`,
};
if (lockVersions[AP.renderer] ?? rootManifest.renderer) {
  out.renderer = lockVersions[AP.renderer] ?? rootManifest.renderer;
}
if (lockVersions[AP.gameslib] ?? rootManifest.gameslib) {
  out.gameslib = lockVersions[AP.gameslib] ?? rootManifest.gameslib;
}
if (lockVersions[AP.recranks] ?? rootManifest.recranks) {
  out.recranks = lockVersions[AP.recranks] ?? rootManifest.recranks;
}
writeJson(path.join(CRONS_ROOT, `ci-deps.${stage}.json`), out);

console.log(`sync-crons-ap-deps: updated crons for stage=${stage}`, out);
