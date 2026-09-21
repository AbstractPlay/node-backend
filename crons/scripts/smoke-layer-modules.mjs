import path from "path";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string} layerDir
 * @param {string[]} pkgSegments
 */
async function importLayerEntry(layerDir, pkgSegments) {
    const entry = path.join(
        ROOT,
        ".serverless",
        "layers",
        layerDir,
        "nodejs",
        "node_modules",
        ...pkgSegments,
        "build",
        "index.js",
    );
    return import(pathToFileURL(entry).href);
}

/**
 * @param {string} layerDir
 * @param {string} pkgName
 */
/** Ensure renderer layer resolves ajv 8+ (avoids hoisted ajv 6 missing uri-js in Lambda). */
async function assertRendererLayerAjv() {
    const rendererPkgPath = path.join(
        ROOT,
        ".serverless",
        "layers",
        "abstractplay-renderer",
        "nodejs",
        "node_modules",
        "@abstractplay",
        "renderer",
        "package.json",
    );
    const rendererPkg = JSON.parse(await readFile(rendererPkgPath, "utf8"));
    const ajvRange = rendererPkg.dependencies?.ajv;
    if (!ajvRange) {
        throw new Error("@abstractplay/renderer package.json missing ajv dependency");
    }

    const layerAjvPkgPath = path.join(
        ROOT,
        ".serverless",
        "layers",
        "abstractplay-renderer",
        "nodejs",
        "node_modules",
        "ajv",
        "package.json",
    );
    const layerAjv = JSON.parse(await readFile(layerAjvPkgPath, "utf8"));
    const major = Number.parseInt(layerAjv.version.split(".")[0] ?? "", 10);
    if (major < 8) {
        throw new Error(
            `renderer layer has ajv@${layerAjv.version} (expected ${ajvRange}); `
            + "check syncPackageDeps resolves nested node_modules first",
        );
    }

    const require = createRequire(rendererPkgPath);
    require("ajv");
}

async function assertLayerPackagePresent(layerDir, pkgName) {
    const pkgPath = path.join(
        ROOT,
        ".serverless",
        "layers",
        layerDir,
        "nodejs",
        "node_modules",
        ...pkgName.split("/"),
        "package.json",
    );
    const { access } = await import("node:fs/promises");
    await access(pkgPath);
}

try {
    const gl = await importLayerEntry("abstractplay-gameslib", ["@abstractplay", "gameslib"]);
    if (!gl.gameinfo || typeof gl.GameFactory !== "function") {
        throw new Error("@abstractplay/gameslib missing expected exports");
    }

    const rr = await importLayerEntry("abstractplay-gameslib", ["@abstractplay", "recranks"]);
    if (typeof rr.Glicko2 !== "function" || typeof rr.ELOBasic !== "function") {
        throw new Error("@abstractplay/recranks missing expected exports");
    }

    const renderer = await importLayerEntry("abstractplay-renderer", ["@abstractplay", "renderer"]);
    if (typeof renderer.addPrefix !== "function") {
        throw new Error("@abstractplay/renderer addPrefix missing after layer import");
    }
    await assertRendererLayerAjv();

    await assertLayerPackagePresent("abstractplay-chromium", "puppeteer-core");
    await assertLayerPackagePresent("abstractplay-chromium", "@sparticuz/chromium");

    console.log("smoke-layer-modules: gameslib + recranks + renderer + chromium layers OK");
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smoke-layer-modules: ${message}`);
    process.exit(1);
}
