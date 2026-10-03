#!/usr/bin/env node
/* eslint-env node */
/**
 * Phase 0+ guard: flag ad hoc live clock math in lib/ and utils/.
 * Allowed homes: lib/clockElapsed.ts, lib/vacation/** (once added).
 *
 * Usage:
 *   node bin/check-clock-derivation.mjs          # report; exit 0
 *   node bin/check-clock-derivation.mjs --strict # exit 1 if non-allowlisted hits
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Files slated for Phase 2 wiring — remove entries as each is migrated to clockElapsed. */
export const CLOCK_DERIVATION_ALLOWLIST = new Set([
]);

const SCAN_DIRS = ["lib", "utils"];

const FORBIDDEN = [
  /Date\.now\(\)\s*-\s*[^;\n]*lastMoveTime/,
  /\bnow\s*-\s*game\.lastMoveTime\b/,
  /\bnow\s*-\s*lastMoveTime\b/,
  /players\[[^\]]+\]\.time!\s*-\s*elapsed/,
  /\.time\s*-\s*\(\s*Date\.now\(\)\s*-\s*[^)]*lastMoveTime/,
  /timeUsed\s*=\s*timestamp\s*-\s*lastMoveTime/,
  /timeUsed\s*=\s*[^;]+-\s*lastMoveTime/,
];

const ALWAYS_SKIP_PREFIXES = [
  "lib/clockElapsed.ts",
  "lib/vacation/",
];

const IGNORE_COMMENT = "clock-elapsed:ignore";

/**
 * @param {string} relPath posix-style relative to repo root
 */
function shouldSkipFile(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  if (!norm.endsWith(".ts") && !norm.endsWith(".js")) {
    return true;
  }
  for (const prefix of ALWAYS_SKIP_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (fs.statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      out.push(rel);
    }
  }
}

/**
 * @param {string} rel
 * @param {string} line
 * @param {number} lineNo
 * @param {RegExp} pattern
 */
function formatHit(rel, line, lineNo, pattern) {
  return `${rel}:${lineNo}: ${pattern.source} — ${line.trim()}`;
}

/**
 * @param {{ strict?: boolean }} opts
 */
export function runClockDerivationCheck(opts = {}) {
  const strict = opts.strict === true;
  /** @type {string[]} */
  const allowlisted = [];
  /** @type {string[]} */
  const violations = [];

  /** @type {string[]} */
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) {
      walk(abs, files);
    }
  }

  for (const rel of files.sort()) {
    if (shouldSkipFile(rel)) {
      continue;
    }
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(IGNORE_COMMENT)) {
        continue;
      }
      for (const pattern of FORBIDDEN) {
        if (pattern.test(line)) {
          const hit = formatHit(rel, line, i + 1, pattern);
          if (CLOCK_DERIVATION_ALLOWLIST.has(rel)) {
            allowlisted.push(hit);
          } else {
            violations.push(hit);
          }
          break;
        }
      }
    }
  }

  console.log("Clock derivation audit (lib/, utils/)");
  console.log(`Allowlisted Phase 2 files: ${[...CLOCK_DERIVATION_ALLOWLIST].join(", ")}`);
  console.log(`Allowlisted hits: ${allowlisted.length}`);
  for (const h of allowlisted) {
    console.log(`  [allowlist] ${h}`);
  }
  console.log(`Non-allowlisted hits: ${violations.length}`);
  for (const h of violations) {
    console.log(`  [VIOLATION] ${h}`);
  }

  if (strict && violations.length > 0) {
    process.exitCode = 1;
    return { allowlisted, violations, ok: false };
  }
  if (strict && allowlisted.length > 0) {
    console.log("\nNote: allowlisted hits remain until Phase 2 clears CLOCK_DERIVATION_ALLOWLIST.");
  }
  return { allowlisted, violations, ok: violations.length === 0 };
}

const strict = process.argv.includes("--strict");
runClockDerivationCheck({ strict });
