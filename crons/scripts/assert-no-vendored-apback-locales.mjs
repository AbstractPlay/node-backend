#!/usr/bin/env node
/**
 * Crons must import apback from repo-root locales/ at bundle time — not vendored copies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(ROOT, "src", "locales");

if (!fs.existsSync(localesDir)) {
  process.exit(0);
}

const offenders = [];
for (const entry of fs.readdirSync(localesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const apback = path.join(localesDir, entry.name, "apback.json");
  if (fs.existsSync(apback)) offenders.push(path.relative(ROOT, apback));
}

if (offenders.length) {
  console.error(
    "Remove vendored apback copies (use root locales/ via @backend/lib/apbackI18n):\n"
    + offenders.map((p) => `  - ${p}`).join("\n"),
  );
  process.exit(1);
}
