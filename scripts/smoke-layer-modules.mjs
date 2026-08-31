import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const layerRoot = path.join(
    ROOT,
    ".serverless",
    "layers",
    "abstractplay-libs",
    "nodejs",
    "node_modules",
);

async function importLayerEntry(pkgSegments) {
    const entry = path.join(layerRoot, ...pkgSegments, "build", "index.js");
    return import(pathToFileURL(entry).href);
}

try {
    const gl = await importLayerEntry(["@abstractplay", "gameslib"]);
    if (!gl.gameinfo || typeof gl.GameFactory !== "function") {
        throw new Error("@abstractplay/gameslib missing expected exports");
    }

    const rr = await importLayerEntry(["@abstractplay", "recranks"]);
    if (typeof rr.Glicko2 !== "function" || typeof rr.ELOBasic !== "function") {
        throw new Error("@abstractplay/recranks missing expected exports");
    }

    const ren = await importLayerEntry(["@abstractplay", "renderer"]);
    if (typeof ren.render !== "function" || typeof ren.addPrefix !== "function") {
        throw new Error("@abstractplay/renderer missing expected exports");
    }

    console.log("smoke-layer-modules: gameslib + recranks + renderer ESM import OK");
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smoke-layer-modules: ${message}`);
    process.exit(1);
}
