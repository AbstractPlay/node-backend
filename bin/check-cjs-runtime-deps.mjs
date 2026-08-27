/* eslint-env node */
/**
 * Guard against ESM-only packages in a CommonJS Lambda init graph.
 * - Warns/fails on known ESM-only deps resolved without an npm override
 * - Optionally requires entry modules (post-build smoke)
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const ESM_ONLY_PACKAGES = new Set(["nanoid"]);
const NANOID_MAX_CJS_MAJOR = 3;

function fail(message) {
  console.error(`check-cjs-runtime-deps: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function packageType(moduleDir) {
  const pkgPath = path.join(moduleDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  const pkg = readJson(pkgPath);
  return pkg.type ?? "commonjs";
}

function resolveInstalledVersion(name) {
  try {
    const pkgPath = require.resolve(`${name}/package.json`);
    return readJson(pkgPath).version;
  } catch {
    return null;
  }
}

function checkKnownEsmOnlyPackages() {
  const pkg = readJson(path.join(ROOT, "package.json"));
  const overrides = pkg.overrides ?? {};
  const lockPath = path.join(ROOT, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    return;
  }
  const lock = readJson(lockPath);

  for (const name of ESM_ONLY_PACKAGES) {
    const version = resolveInstalledVersion(name);
    if (!version) {
      continue;
    }
    const major = Number.parseInt(version.split(".")[0], 10);
    if (name === "nanoid" && major > NANOID_MAX_CJS_MAJOR && !overrides.nanoid) {
      fail(
        `${name}@${version} is ESM-only; pin overrides.nanoid to 3.3.x for Lambda CJS`,
      );
    }
    const moduleDir = path.dirname(require.resolve(`${name}/package.json`));
    if (packageType(moduleDir) === "module" && !overrides[name]) {
      fail(`${name} resolves as type=module without an npm override`);
    }
  }

  void lock;
}

function smokeRequireEntry(entry) {
  try {
    const resolved = entry.startsWith(".")
      ? path.resolve(ROOT, entry)
      : entry;
    require(resolved);
    console.log(`check-cjs-runtime-deps: require OK ${entry}`);
  } catch (error) {
    fail(`require(${entry}) failed: ${error.message}`);
  }
}

checkKnownEsmOnlyPackages();

const entries = process.argv.slice(2);
for (const entry of entries) {
  smokeRequireEntry(entry);
}

if (entries.length === 0) {
  console.log("check-cjs-runtime-deps OK (lockfile policy)");
} else {
  console.log("check-cjs-runtime-deps OK");
}
