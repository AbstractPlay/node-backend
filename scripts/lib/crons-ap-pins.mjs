/**
 * Shared logic to keep crons workspace @abstractplay/* pins aligned with the repo root.
 * Must not import @abstractplay/ap-deps-tools (runs before npm ci on a clean checkout).
 */
import fs from "node:fs";
import path from "node:path";

export const AP_PACKAGES = [
  "@abstractplay/gameslib",
  "@abstractplay/recranks",
  "@abstractplay/renderer",
];

const MANIFEST_KEYS = {
  "@abstractplay/gameslib": "gameslib",
  "@abstractplay/recranks": "recranks",
  "@abstractplay/renderer": "renderer",
};

export function resolveStage({ argv = process.argv, env = process.env } = {}) {
  const stageArg = argv.includes("--stage")
    ? argv[argv.indexOf("--stage") + 1]
    : undefined;
  const stageFromEnv = env.AP_DEPS_STAGE;
  const stage =
    stageArg ??
    (stageFromEnv === "prod" ? "prod" : stageFromEnv === "dev" ? "dev" : "dev");
  if (stage !== "dev" && stage !== "prod") {
    throw new Error("stage must be dev or prod");
  }
  return stage;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** @param {string} rootDir */
export function readApVersionsFromLockfile(rootDir) {
  const lockPath = path.join(rootDir, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    return {};
  }
  const lock = readJson(lockPath);
  const rootDeps = lock.packages?.[""]?.dependencies ?? {};
  const cronsDeps = lock.packages?.crons?.dependencies ?? {};
  const out = {};
  for (const pkg of AP_PACKAGES) {
    const version = rootDeps[pkg] ?? cronsDeps[pkg];
    if (version) {
      out[pkg] = version;
    }
  }
  return out;
}

/**
 * @param {string} rootDir
 * @param {"dev"|"prod"} stage
 */
export function expectedApVersions(rootDir, stage) {
  const rootPkg = readJson(path.join(rootDir, "package.json"));
  const rootManifest = readJson(path.join(rootDir, `ci-deps.${stage}.json`));
  const lockVersions = readApVersionsFromLockfile(rootDir);
  const versions = {};
  for (const pkg of AP_PACKAGES) {
    const key = MANIFEST_KEYS[pkg];
    const version =
      rootPkg.dependencies?.[pkg] ?? lockVersions[pkg] ?? rootManifest[key];
    if (version) {
      versions[pkg] = version;
    }
  }
  return versions;
}

/**
 * @param {string} rootDir
 * @param {"dev"|"prod"} stage
 */
export function syncCronsApPins(rootDir, stage) {
  const expected = expectedApVersions(rootDir, stage);
  const cronsPkgPath = path.join(rootDir, "crons", "package.json");
  const cronsPkg = readJson(cronsPkgPath);
  cronsPkg.dependencies = cronsPkg.dependencies ?? {};

  let changed = false;
  for (const pkg of AP_PACKAGES) {
    const version = expected[pkg];
    if (!version || !(pkg in cronsPkg.dependencies)) {
      continue;
    }
    if (cronsPkg.dependencies[pkg] !== version) {
      cronsPkg.dependencies[pkg] = version;
      changed = true;
    }
  }
  if (changed) {
    writeJson(cronsPkgPath, cronsPkg);
  }

  return {
    stage,
    changed,
    gameslib: cronsPkg.dependencies["@abstractplay/gameslib"],
    renderer: cronsPkg.dependencies["@abstractplay/renderer"],
    recranks: cronsPkg.dependencies["@abstractplay/recranks"],
  };
}

/** @param {string} rootDir */
export function findCronsApPinMismatches(rootDir) {
  const rootPkg = readJson(path.join(rootDir, "package.json"));
  const cronsPkg = readJson(path.join(rootDir, "crons", "package.json"));
  const mismatches = [];
  for (const pkg of AP_PACKAGES) {
    const expected = rootPkg.dependencies?.[pkg];
    if (!expected) {
      continue;
    }
    const actual = cronsPkg.dependencies?.[pkg];
    if (actual !== expected) {
      mismatches.push({ pkg, expected, actual });
    }
  }
  return mismatches;
}
