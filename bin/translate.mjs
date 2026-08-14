import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ES_US_DIALECT = [
  "Use Latin American Spanish as spoken in the United States (es-US).",
  'Use "ustedes" (not "vosotros"), LatAm vocabulary (e.g. computadora, celular, aplicación), and informal "tú" for game UI where natural.',
  "Avoid European Spanish forms (vuestro, os, ordenador).",
  "Use standard board-game terms (Pasar, Rendirse, Tablero, etc.).",
].join(" ");

const TARGET_LANGUAGES = [
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  {
    code: "es-US",
    name: "Latin American Spanish (United States)",
    dialect: ES_US_DIALECT,
  },
];

function localeRoots(sourcePath) {
  const abs = path.resolve(sourcePath);
  const localesDir = path.dirname(path.dirname(abs));
  const parent = path.dirname(localesDir);
  const repoRoot = path.basename(parent) === "public" ? path.dirname(parent) : parent;
  return { localesDir, repoRoot };
}

function srcPathFor(repoRoot, langCode, fileName) {
  return path.join(repoRoot, "locale-src", langCode, fileName);
}

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

function getLeafValue(obj, leafPath) {
  const parts = leafPath.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

function setLeafValue(obj, leafPath, value) {
  const parts = leafPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function unflatten(flat) {
  const result = {};
  for (const [leafPath, value] of Object.entries(flat)) {
    setLeafValue(result, leafPath, value);
  }
  return result;
}

function getEmbeddedSrcTracking(targetData) {
  const legacy = {};
  for (const [key, value] of Object.entries(targetData)) {
    if (!key.startsWith("_src_")) continue;
    const srcKey = key.slice(5);
    if (typeof value === "string") {
      legacy[srcKey] = value;
    } else if (value && typeof value === "object") {
      Object.assign(legacy, collectLeaves(value, srcKey));
    }
  }
  return legacy;
}

function loadSrcTracking(repoRoot, langCode, fileName, targetData) {
  const srcPath = srcPathFor(repoRoot, langCode, fileName);
  if (fs.existsSync(srcPath)) {
    try {
      return JSON.parse(fs.readFileSync(srcPath, "utf-8"));
    } catch (error) {
      console.error(`[${langCode}] ${fileName}: Invalid locale-src JSON: ${error.message}`);
    }
  }
  return getEmbeddedSrcTracking(targetData);
}

function writeSrcTracking(repoRoot, langCode, fileName, srcTracking) {
  const srcPath = srcPathFor(repoRoot, langCode, fileName);
  const sortedSrc = {};
  for (const key of Object.keys(srcTracking).sort()) {
    sortedSrc[key] = srcTracking[key];
  }
  fs.mkdirSync(path.dirname(srcPath), { recursive: true });
  fs.writeFileSync(srcPath, JSON.stringify(sortedSrc, null, 2) + "\n");
}

function normalizeTrackingEntry(entry) {
  if (entry == null) {
    return { src: undefined, out: undefined };
  }
  if (typeof entry === "string") {
    return { src: entry, out: undefined };
  }
  if (typeof entry === "object") {
    return {
      src: typeof entry.src === "string" ? entry.src : undefined,
      out: typeof entry.out === "string" ? entry.out : undefined,
    };
  }
  return { src: undefined, out: undefined };
}

function makeTrackingEntry(sourceValue, translatedValue) {
  return { src: sourceValue, out: translatedValue };
}

function isSuspectEnglishCopy(value) {
  if (typeof value !== "string" || value.length < 40) {
    return false;
  }
  if (/\.\s+[A-Z]/.test(value)) {
    return true;
  }
  return value.trim().split(/\s+/).length >= 8;
}

function isVerifiedSame(trackingEntry, sourceValue, translated) {
  const { src, out } = normalizeTrackingEntry(trackingEntry);
  return src === sourceValue && out === translated;
}

function backfillSrcTracking(sourceData, targetData, srcTracking) {
  const sourceLeaves = collectLeaves(sourceData);
  let backfilled = false;
  for (const [leafPath, sourceValue] of Object.entries(sourceLeaves)) {
    const translated = getLeafValue(targetData, leafPath);
    if (!translated) {
      continue;
    }
    const { src, out } = normalizeTrackingEntry(srcTracking[leafPath]);
    if (src !== sourceValue || out !== translated) {
      srcTracking[leafPath] = makeTrackingEntry(sourceValue, translated);
      backfilled = true;
    }
  }
  return backfilled;
}

function getDiffLeaves(sourceData, targetData, srcTracking) {
  const sourceLeaves = collectLeaves(sourceData);
  const diff = {};
  for (const [leafPath, sourceValue] of Object.entries(sourceLeaves)) {
    const translated = getLeafValue(targetData, leafPath);
    const tracking = srcTracking[leafPath];
    const { src, out } = normalizeTrackingEntry(tracking);

    if (!translated) {
      diff[leafPath] = sourceValue;
      continue;
    }

    if (src !== undefined && src !== sourceValue) {
      diff[leafPath] = sourceValue;
      continue;
    }

    if (out !== undefined && out !== translated) {
      diff[leafPath] = sourceValue;
      continue;
    }

    if (translated === sourceValue) {
      if (isVerifiedSame(tracking, sourceValue, translated)) {
        continue;
      }
      if (isSuspectEnglishCopy(sourceValue)) {
        diff[leafPath] = sourceValue;
      }
    }
  }
  return diff;
}

function buildCleanTargetData(sourceData, targetData) {
  const cleanTargetData = {};
  for (const key of Object.keys(sourceData)) {
    if (key.startsWith("_")) continue;
    if (targetData[key] !== undefined) {
      cleanTargetData[key] = targetData[key];
    }
  }
  return cleanTargetData;
}

function buildPrompt(lang) {
  const dialectBlock = lang.dialect ? `\n\nDIALECT:\n${lang.dialect}` : "";
  return `You are an expert translator specializing in UI strings for abstract strategy board games (like Chess, Go, Tak, etc.).
Translate the provided JSON key-value pairs from English to ${lang.name} (${lang.code}).${dialectBlock}

STRICT RULES:
1. Preserve all placeholders verbatim (e.g. {{count}}, {{player}}, {0}, %s, HTML tags). Do not modify variables inside braces.
2. Use natural tabletop gaming terms (e.g., "Pass", "Resign", "Stalemate", "Hand", "Pip", "Board").
3. Return a JSON object matching the exact input keys supplied, with translated string values.
4. Preserve all Markdown syntax exactly: [text](url), *italic*, **bold**, \`code\`, bullet lists, and literal \\n newlines.
5. Return ONLY valid JSON. Escape all double quotes inside string values as \\". Do not use smart or curly quotes.
6. Do not translate URLs, placeholder tokens, or content inside backticks unless natural in the target language.`;
}

async function translateFile(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    console.error(`File not found: ${sourcePath}`);
    return;
  }

  const sourceData = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
  const { localesDir, repoRoot } = localeRoots(sourcePath);
  const fileName = path.basename(sourcePath);

  for (const lang of TARGET_LANGUAGES) {
    const targetDir = path.join(localesDir, lang.code);
    const targetPath = path.join(targetDir, fileName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let targetData = {};
    if (fs.existsSync(targetPath)) {
      try {
        targetData = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch {
        targetData = {};
      }
    }

    let srcTracking = loadSrcTracking(repoRoot, lang.code, fileName, targetData);
    const diffLeaves = getDiffLeaves(sourceData, targetData, srcTracking);
    const keysToTranslate = Object.keys(diffLeaves);

    if (keysToTranslate.length === 0) {
      if (backfillSrcTracking(sourceData, targetData, srcTracking)) {
        writeSrcTracking(repoRoot, lang.code, fileName, srcTracking);
        console.log(`[${lang.code}] ${fileName}: Backfilled locale-src stamps (translations already up to date).`);
      } else {
        console.log(`[${lang.code}] ${fileName}: 100% up to date. Skipping.`);
      }
      continue;
    }

    console.log(`[${lang.code}] ${fileName}: Translating ${keysToTranslate.length} new/updated keys...`);

    const prompt = buildPrompt(lang);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `${prompt}\n\nInput JSON:\n${JSON.stringify(diffLeaves, null, 2)}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      let rawText = response.text?.trim() ?? "";
      if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
      }

      const translatedChunk = JSON.parse(rawText);
      const nestedChunk = unflatten(translatedChunk);
      for (const [key, value] of Object.entries(nestedChunk)) {
        targetData[key] = value;
      }
      for (const leafPath of Object.keys(diffLeaves)) {
        const sourceValue = diffLeaves[leafPath];
        const translatedValue = translatedChunk[leafPath] ?? getLeafValue(targetData, leafPath);
        srcTracking[leafPath] = makeTrackingEntry(sourceValue, translatedValue);
      }

      const cleanTargetData = buildCleanTargetData(sourceData, targetData);
      fs.writeFileSync(targetPath, JSON.stringify(cleanTargetData, null, 2) + "\n");
      writeSrcTracking(repoRoot, lang.code, fileName, srcTracking);
      console.log(`[${lang.code}] ${fileName}: Updated successfully.`);
    } catch (err) {
      console.error(`[${lang.code}] ${fileName}: Error translating:`, err);
    }
  }
}

async function run() {
  const files = process.argv.slice(2);
  for (const file of files) {
    await translateFile(file);
  }
}

run();
