import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APBACK_LANGS, syncApbackLocales } from "./sync-apback-locales.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_ROOT = path.join(__dirname, "..", "src", "locales");

async function hasAllLocales() {
    for (const lang of APBACK_LANGS) {
        try {
            await fs.access(path.join(TARGET_ROOT, lang, "apback.json"));
        } catch {
            return false;
        }
    }
    return true;
}

if (await hasAllLocales()) {
    process.exit(0);
}

try {
    await syncApbackLocales({ write: true });
    console.log("Generated src/locales from node-backend");
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    console.error(
        "Install apback copy with: npm run sync-apback-locales "
        + "(clone node-backend as ../node-backend or set NODE_BACKEND_ROOT)",
    );
    process.exit(1);
}
