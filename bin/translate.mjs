import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TARGET_LANGUAGES = [
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
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

function getDiffLeaves(sourceData, targetData, srcTracking) {
  const sourceLeaves = collectLeaves(sourceData);
  const diff = {};
  for (const [leafPath, sourceValue] of Object.entries(sourceLeaves)) {
    const translated = getLeafValue(targetData, leafPath);
    if (!translated || srcTracking[leafPath] !== sourceValue) {
      diff[leafPath] = sourceValue;
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
      console.log(`[${lang.code}] ${fileName}: 100% up to date. Skipping.`);
      continue;
    }

    console.log(`[${lang.code}] ${fileName}: Translating ${keysToTranslate.length} new/updated keys...`);

    const prompt = `
    You are an expert translator specializing in UI strings for abstract strategy board games (like Chess, Go, Tak, etc.).
    Translate the provided JSON key-value pairs from English to ${lang.name}.

    STRICT RULES:
    1. Preserve all placeholders verbatim (e.g. {{count}}, {{player}}, {0}, %s, HTML tags). Do not modify variables inside braces.
    2. Use natural tabletop gaming terms (e.g., "Pass", "Resign", "Stalemate", "Hand", "Pip", "Board").
    3. Return a JSON object matching the exact input keys supplied, with translated string values.
    `;

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
        srcTracking[leafPath] = diffLeaves[leafPath];
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
