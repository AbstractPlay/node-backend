#!/usr/bin/env node
/* eslint-env node */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MANAGED_LANGS = ["de", "fr", "it", "es-US"];
const LOCALE_FILE = "apback.json";

function collectLeaves(obj, prefix = "") {
  const leaves = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return leaves;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("_")) continue;
    const leafPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      leaves[leafPath] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(leaves, collectLeaves(value, leafPath));
    }
  }
  return leaves;
}

function flattenSrcValue(key, value, prefix = "") {
  const base = prefix ? `${prefix}.${key}` : key;
  if (typeof value === "string") {
    return { [base]: value };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    let out = {};
    for (const [k, v] of Object.entries(value)) {
      Object.assign(out, flattenSrcValue(k, v, base));
    }
    return out;
  }
  return {};
}

function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function splitFile(lang) {
  const localePath = path.join(ROOT, "locales", lang, LOCALE_FILE);
  const srcPath = path.join(ROOT, "locale-src", lang, LOCALE_FILE);

  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const src = {};
  const translations = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_src_")) {
      Object.assign(src, flattenSrcValue(key.slice(5), value));
    } else {
      translations[key] = value;
    }
  }

  if (Object.keys(src).length === 0) {
    console.warn(`[${lang}/${LOCALE_FILE}] No _src_* keys — skipping`);
    return false;
  }

  fs.mkdirSync(path.dirname(srcPath), { recursive: true });
  fs.writeFileSync(srcPath, JSON.stringify(sortObjectKeys(src), null, 2) + "\n");
  fs.writeFileSync(localePath, JSON.stringify(translations, null, 2) + "\n");

  const srcKeys = Object.keys(src);
  const leafKeys = Object.keys(collectLeaves(translations));
  console.log(`[${lang}/${LOCALE_FILE}] split ${srcKeys.length} src keys, ${leafKeys.length} translation leaves`);

  return true;
}

function main() {
  let count = 0;
  for (const lang of MANAGED_LANGS) {
    if (splitFile(lang)) {
      count++;
    }
  }
  console.log(`Done. Split ${count} file(s).`);
}

main();
