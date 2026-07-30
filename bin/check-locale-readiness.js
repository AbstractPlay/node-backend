#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "locales");
const REFERENCE_LOCALE = "en";
const LOCALE_FILE = "apback.json";

const PLACEHOLDER_PREFIX_RE = /^\[[A-Za-z_]+\]\s*/;
const I18N_PLACEHOLDER_RE = /\{\{[-\s]*[^}]+\}\}/g;
const URL_RE = /https?:\/\/\S+/g;

function flattenStrings(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[pathKey] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenStrings(value, pathKey));
    }
  }
  return out;
}

function normalizeForComparison(value) {
  return value
    .replace(I18N_PLACEHOLDER_RE, "")
    .replace(URL_RE, "")
    .replace(/abstractplay/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasPlaceholderPrefix(value) {
  return PLACEHOLDER_PREFIX_RE.test(value.trim());
}

function stripPlaceholderPrefix(value) {
  return value.trim().replace(PLACEHOLDER_PREFIX_RE, "");
}

function looksLikeEnglish(value, englishValue) {
  if (englishValue === undefined) {
    return false;
  }
  const stripped = stripPlaceholderPrefix(value);
  const left = normalizeForComparison(stripped);
  const right = normalizeForComparison(englishValue);
  if (!left || !right) {
    return false;
  }
  return left === right;
}

function loadLocaleStrings(locale) {
  const filePath = path.join(LOCALES_DIR, locale, LOCALE_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing locale file: ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return flattenStrings(data);
}

function isTranslationKey(key) {
  return !key.startsWith("_src_");
}

function auditLocale(locale, reference) {
  const strings = loadLocaleStrings(locale);
  const translationKeys = Object.keys(reference).filter(isTranslationKey);

  const missing = [];
  const empty = [];
  const placeholderPrefix = [];
  const englishLike = [];

  for (const key of translationKeys) {
    if (!(key in strings)) {
      missing.push(key);
      continue;
    }

    const value = strings[key];
    if (!value.trim()) {
      empty.push(key);
      continue;
    }

    if (hasPlaceholderPrefix(value)) {
      placeholderPrefix.push({ key, value });
      continue;
    }

    if (looksLikeEnglish(value, reference[key])) {
      englishLike.push({ key, value });
    }
  }

  const present = translationKeys.length - missing.length;
  const issueCount = missing.length + empty.length + placeholderPrefix.length + englishLike.length;
  const ready = issueCount === 0;

  return {
    locale,
    ready,
    totalKeys: translationKeys.length,
    presentKeys: present,
    missing,
    empty,
    placeholderPrefix,
    englishLike,
    issueCount,
  };
}

function formatIssueList(items, formatter) {
  if (items.length === 0) {
    return "    (none)";
  }
  return items.map((item) => `    - ${formatter(item)}`).join("\n");
}

function printReport(results, verbose) {
  const ready = results.filter((r) => r.ready);
  const notReady = results.filter((r) => !r.ready);

  console.log("Locale readiness report");
  console.log("=======================");
  console.log(`Reference: ${REFERENCE_LOCALE}/${LOCALE_FILE}`);
  console.log(`Checked: ${results.length} locale(s)\n`);

  console.log("Ready:");
  if (ready.length === 0) {
    console.log("  (none)");
  } else {
    for (const result of ready) {
      console.log(`  - ${result.locale} (${result.presentKeys}/${result.totalKeys} keys)`);
    }
  }

  console.log("\nNot ready:");
  if (notReady.length === 0) {
    console.log("  (none)");
  } else {
    for (const result of notReady) {
      console.log(
        `  - ${result.locale} (${result.presentKeys}/${result.totalKeys} keys, ${result.issueCount} issue(s))`
      );
      if (!verbose) {
        continue;
      }
      if (result.missing.length) {
        console.log("    missing:");
        console.log(formatIssueList(result.missing, (key) => key));
      }
      if (result.empty.length) {
        console.log("    empty:");
        console.log(formatIssueList(result.empty, (key) => key));
      }
      if (result.placeholderPrefix.length) {
        console.log("    [XX] prefix:");
        console.log(
          formatIssueList(result.placeholderPrefix, ({ key, value }) => `${key}: ${JSON.stringify(value)}`)
        );
      }
      if (result.englishLike.length) {
        console.log("    looks English:");
        console.log(
          formatIssueList(result.englishLike, ({ key, value }) => `${key}: ${JSON.stringify(value)}`)
        );
      }
      console.log("");
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const failOnNotReady = args.includes("--fail");
  const onlyLocales = args.filter((arg) => !arg.startsWith("-"));

  const reference = loadLocaleStrings(REFERENCE_LOCALE);
  const localeDirs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((locale) => locale !== REFERENCE_LOCALE)
    .filter((locale) => fs.existsSync(path.join(LOCALES_DIR, locale, LOCALE_FILE)))
    .filter((locale) => onlyLocales.length === 0 || onlyLocales.includes(locale))
    .sort();

  const results = localeDirs.map((locale) => auditLocale(locale, reference));
  printReport(results, verbose);

  if (failOnNotReady && results.some((result) => !result.ready)) {
    process.exit(1);
  }
}

main();
