import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LAYER_NAME = "abstractplay-libs";

/** Directory names removed when found under layer node_modules (not at repo root). */
const PRUNE_DIR_NAMES = new Set([
    "doc",
    "docs",
    "example",
    "examples",
    "test",
    "tests",
    "__tests__",
    "fixtures",
    ".github",
    "i18n",
]);

/** File-name predicates for pruning under layer node_modules only. */
const PRUNE_FILE_MATCHERS = [
    (name) => /\.md$/i.test(name),
    (name) => /^README/i.test(name),
    (name) => /^CHANGELOG/i.test(name),
    (name) => /^HISTORY/i.test(name),
    (name) => /^CONTRIBUTING/i.test(name),
    (name) => /^AUTHORS/i.test(name),
    (name) => /^LICENSE/i.test(name),
    (name) => /\.test\.js$/i.test(name),
    (name) => /\.spec\.js$/i.test(name),
    (name) => /\.map$/i.test(name),
    (name) => /\.d\.ts$/i.test(name),
    (name) => name === "tsconfig.json",
    (name) => name === "jsconfig.json",
    (name) => name === "Makefile",
    (name) => name === ".eslintrc.js",
];

async function assertUnderLayer(layerDir, targetPath) {
    const root = await fs.realpath(layerDir);
    let resolved;
    try {
        resolved = await fs.realpath(targetPath);
    } catch {
        resolved = path.resolve(targetPath);
    }
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(
            `Refusing to touch path outside layer: ${resolved} (layer root: ${root})`,
        );
    }
    return resolved;
}

async function safeRemove(layerDir, targetPath) {
    if (!(await fs.pathExists(targetPath))) {
        return;
    }
    await assertUnderLayer(layerDir, targetPath);
    console.log(`   - Removing ${targetPath}`);
    await fs.remove(targetPath);
}

async function pruneLayerNodeModules(layerDir, nodeModulesDir) {
    await assertUnderLayer(layerDir, nodeModulesDir);

    async function walk(dir) {
        await assertUnderLayer(layerDir, dir);
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (err) {
            console.warn(`   - skip unreadable ${dir}: ${err.message}`);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (PRUNE_DIR_NAMES.has(entry.name)) {
                    await safeRemove(layerDir, fullPath);
                } else {
                    await walk(fullPath);
                }
            } else if (entry.isFile() && PRUNE_FILE_MATCHERS.some((match) => match(entry.name))) {
                await safeRemove(layerDir, fullPath);
            }
        }
    }

    if (await fs.pathExists(nodeModulesDir)) {
        await walk(nodeModulesDir);
    }
}

async function createLayer(layerName, packagesToInclude) {
    const layerDir = path.resolve(ROOT, `.serverless/layers/${layerName}`);
    const nodejsDir = path.join(layerDir, "nodejs");
    const rootPackageJson = JSON.parse(
        fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );

    console.log(`Creating ${layerName} layer...`);

    await fs.emptyDir(layerDir);
    await fs.ensureDir(nodejsDir);

    const cacheBustContent = `Build time: ${new Date().toISOString()}`;
    await fs.writeFile(path.join(nodejsDir, "build-info.txt"), cacheBustContent);

    const layerPackageJson = {
        type: "module",
        dependencies: {},
    };

    for (const pkg of packagesToInclude) {
        let version =
            rootPackageJson.dependencies?.[pkg] ||
            rootPackageJson.devDependencies?.[pkg];
        if (!version) {
            throw new Error(`Could not find ${pkg} in package.json`);
        }
        if (version.startsWith("file:")) {
            const rel = version.slice("file:".length);
            version = `file:${path.resolve(ROOT, rel)}`;
        }
        layerPackageJson.dependencies[pkg] = version;
    }

    await fs.writeJson(path.join(nodejsDir, "package.json"), layerPackageJson, { spaces: 2 });

    const npmrcPath = path.join(ROOT, ".npmrc");
    if (await fs.pathExists(npmrcPath)) {
        await fs.copy(npmrcPath, path.join(nodejsDir, ".npmrc"));
    }

    console.log(`Installing dependencies for ${layerName} layer...`);
    execSync("npm install --omit=dev", { cwd: nodejsDir, stdio: "inherit" });

    const nodeModulesDir = path.join(nodejsDir, "node_modules");
    await assertUnderLayer(layerDir, nodeModulesDir);

    console.log(`Pruning files for ${layerName} layer...`);
    const gameslibDir = path.join(nodejsDir, "node_modules", "@abstractplay", "gameslib");
    for (const item of ["docs", "README.md"]) {
        await safeRemove(layerDir, path.join(gameslibDir, item));
    }
    const sourceLocalesEn = path.resolve(
        ROOT,
        "node_modules/@abstractplay/gameslib/locales/en",
    );
    const targetLocalesEn = path.join(gameslibDir, "locales", "en");
    if (await fs.pathExists(sourceLocalesEn)) {
        await fs.ensureDir(path.join(gameslibDir, "locales"));
        await fs.copy(sourceLocalesEn, targetLocalesEn, { overwrite: true });
        console.log("   - Ensured English locale bundles in layer gameslib");
    }
    const localesDir = path.join(gameslibDir, "locales");
    if (await fs.pathExists(localesDir)) {
        const localeLangs = await fs.readdir(localesDir);
        for (const lang of localeLangs) {
            if (lang !== "en") {
                await safeRemove(layerDir, path.join(localesDir, lang));
            }
        }
    }

    console.log(`Aggressively pruning all node_modules for ${layerName} layer...`);
    await pruneLayerNodeModules(layerDir, nodeModulesDir);

    console.log(`✅ ${layerName} layer created successfully in .serverless/layers/${layerName}`);
}

async function main() {
    await createLayer(LAYER_NAME, [
        "@abstractplay/gameslib",
        "@abstractplay/recranks",
        "@abstractplay/renderer",
    ]);
}

main().catch((err) => {
    console.error("Error creating layers:", err);
    process.exit(1);
});
