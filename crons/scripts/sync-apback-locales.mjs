import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_ROOT = path.join(ROOT, "src", "locales");

/** Must match node-backend `locales/` layout. */
export const APBACK_LANGS = ["en", "fr", "de", "it", "es-US", "pt", "ta"];

export function resolveNodeBackendRoot() {
    const fromEnv = process.env.NODE_BACKEND_ROOT;
    if (fromEnv) {
        return path.resolve(fromEnv);
    }
    return path.resolve(ROOT, "..");
}

function sha256(text) {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * @param {{ write?: boolean }} opts
 * @returns {Promise<{ sourceRoot: string; copied: string[]; removed: string[] }>}
 */
export async function syncApbackLocales(opts = {}) {
    const write = opts.write !== false;
    const sourceRoot = resolveNodeBackendRoot();
    const sourceLocales = path.join(sourceRoot, "locales");

    try {
        await fs.access(sourceLocales);
    } catch {
        throw new Error(
            `node-backend locales not found at ${sourceLocales}. `
            + "Set NODE_BACKEND_ROOT or clone AbstractPlay/node-backend as a sibling.",
        );
    }

    const copied = [];
    for (const lang of APBACK_LANGS) {
        const src = path.join(sourceLocales, lang, "apback.json");
        const dest = path.join(TARGET_ROOT, lang, "apback.json");
        const body = await fs.readFile(src, "utf8");
        JSON.parse(body);
        if (write) {
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.writeFile(dest, body.endsWith("\n") ? body : `${body}\n`, "utf8");
        }
        copied.push(dest);
    }

    const removed = [];
    if (write) {
        let entries;
        try {
            entries = await fs.readdir(TARGET_ROOT, { withFileTypes: true });
        } catch {
            entries = [];
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            if (APBACK_LANGS.includes(entry.name)) {
                continue;
            }
            const langDir = path.join(TARGET_ROOT, entry.name);
            await fs.rm(langDir, { recursive: true, force: true });
            removed.push(langDir);
        }
    }

    return { sourceRoot, copied, removed };
}

/**
 * @returns {Promise<{ ok: boolean; mismatches: { lang: string; expected: string; actual: string }[] }>}
 */
export async function diffApbackLocales() {
    const sourceRoot = resolveNodeBackendRoot();
    const sourceLocales = path.join(sourceRoot, "locales");
    const mismatches = [];

    for (const lang of APBACK_LANGS) {
        const src = path.join(sourceLocales, lang, "apback.json");
        const dest = path.join(TARGET_ROOT, lang, "apback.json");
        let expected;
        let actual;
        try {
            expected = await fs.readFile(src, "utf8");
        } catch {
            mismatches.push({ lang, expected: "missing source", actual: dest });
            continue;
        }
        try {
            actual = await fs.readFile(dest, "utf8");
        } catch {
            mismatches.push({ lang, expected: sha256(expected), actual: "missing vendored file" });
            continue;
        }
        const normExpected = expected.endsWith("\n") ? expected : `${expected}\n`;
        const normActual = actual.endsWith("\n") ? actual : `${actual}\n`;
        if (sha256(normExpected) !== sha256(normActual)) {
            mismatches.push({ lang, expected: "out of date", actual: dest });
        }
    }

    let entries;
    try {
        entries = await fs.readdir(TARGET_ROOT, { withFileTypes: true });
    } catch {
        entries = [];
    }
    for (const entry of entries) {
        if (entry.isDirectory() && !APBACK_LANGS.includes(entry.name)) {
            mismatches.push({
                lang: entry.name,
                expected: "removed",
                actual: path.join(TARGET_ROOT, entry.name),
            });
        }
    }

    return { ok: mismatches.length === 0, mismatches };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const result = await syncApbackLocales({ write: true });
    console.log(`Synced apback locales from ${result.sourceRoot}`);
    for (const file of result.copied) {
        console.log(`  ${path.relative(ROOT, file)}`);
    }
    for (const dir of result.removed) {
        console.log(`  removed ${path.relative(ROOT, dir)}`);
    }
}
