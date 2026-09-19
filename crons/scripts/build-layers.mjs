import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { getLockfileVersions } from "@abstractplay/ap-deps-tools/lockfile-versions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRONS_ROOT = path.resolve(__dirname, "..");
/** Workspace hoists dependencies and lockfile to the monorepo root. */
const MONOREPO_ROOT = path.resolve(CRONS_ROOT, "..");
const LAYER_UNZIPPED_LIMIT = 262_144_000; // 250 MiB — AWS Lambda layer limit

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
    "coverage",
    "benchmark",
    "bench",
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
    (name) => /^LICENCE/i.test(name),
    (name) => /\.test\.js$/i.test(name),
    (name) => /\.spec\.js$/i.test(name),
    (name) => /\.map$/i.test(name),
    (name) => /\.d\.ts$/i.test(name),
    (name) => name === "tsconfig.json",
    (name) => name === "jsconfig.json",
    (name) => name === "Makefile",
    (name) => name === ".eslintrc.js",
];

/** AP package roots (@abstractplay/*) — extra dirs/files stripped inside those trees. */
const AP_PACKAGE_CRUFT_DIRS = new Set([
    "src",
    "test",
    "tests",
    "docs",
    "playground",
    "scripts",
    "bin",
    ".github",
    ".cursor",
    "node_modules",
]);

const AP_PACKAGE_CRUFT_FILE = [
    /^README/i,
    /^CHANGELOG/i,
    /^TODO$/i,
    /\.md$/i,
    /^eslint\.config\./,
    /^webpack\.config\./,
    /^tsconfig/,
    /^serverless\.yml$/,
    /^i18next-parser\.config\./,
    /^\.aiexclude$/,
];

function shouldRemoveApPackageFile(name) {
    if (name.endsWith(".map")) {
        return true;
    }
    return AP_PACKAGE_CRUFT_FILE.some((pattern) => pattern.test(name));
}

function formatBytes(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * @param {string} dirPath
 * @returns {Promise<number>}
 */
async function dirSize(dirPath) {
    let total = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            total += await dirSize(full);
        } else if (entry.isFile()) {
            total += (await fs.stat(full)).size;
        }
    }
    return total;
}

/**
 * Refuse paths outside the layer root (follows symlinks/junctions).
 * @param {string} layerDir
 * @param {string} targetPath
 * @returns {Promise<string>} resolved absolute path safe to touch
 */
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

/**
 * Remove only when the target resolves inside layerDir.
 * @param {string} layerDir
 * @param {string} targetPath
 */
async function safeRemove(layerDir, targetPath) {
    if (!(await fs.pathExists(targetPath))) {
        return;
    }
    await assertUnderLayer(layerDir, targetPath);
    console.log(`   - Removing ${targetPath}`);
    await fs.remove(targetPath);
}

/**
 * Walk layer node_modules and prune known cruft without repo-wide globs.
 * @param {string} layerDir
 * @param {string} nodeModulesDir
 */
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
                } else if (entry.name === "@types") {
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

/**
 * Trim cruft inside @abstractplay/* package trees (src, tests, docs, etc.).
 * @param {string} layerDir
 * @param {string} pkgPath
 */
async function trimApPackage(layerDir, pkgPath) {
    if (!(await fs.pathExists(pkgPath))) {
        return;
    }
    await assertUnderLayer(layerDir, pkgPath);

    async function walk(dir, apPackageRoot) {
        await assertUnderLayer(layerDir, dir);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (apPackageRoot && AP_PACKAGE_CRUFT_DIRS.has(entry.name)) {
                    await safeRemove(layerDir, fullPath);
                } else {
                    await walk(fullPath, false);
                }
            } else if (
                entry.isFile()
                && apPackageRoot
                && shouldRemoveApPackageFile(entry.name)
            ) {
                await safeRemove(layerDir, fullPath);
            }
        }
    }

    await walk(pkgPath, true);
}

/**
 * Copy a package (and non-excluded deps) from project node_modules into the layer.
 * @param {string} layerDir
 * @param {string} packageName
 * @param {string[]} excludeDeps
 */
async function syncPackageDeps(layerDir, nodeModulesDir, packageName, excludeDeps = []) {
    const src = path.resolve(MONOREPO_ROOT, "node_modules", ...packageName.split("/"));
    const dest = path.resolve(nodeModulesDir, ...packageName.split("/"));

    if (!(await fs.pathExists(src))) {
        console.warn(`Warning: Local source for ${packageName} not found at ${src}. Skipping override.`);
        return;
    }

    console.log(`Syncing local code for ${packageName} into layer...`);
    await safeRemove(layerDir, dest);
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(src, dest, { overwrite: true });

    const internalPkg = await fs.readJson(path.join(src, "package.json"));
    if (!internalPkg.dependencies) {
        return;
    }

    const excluded = new Set(excludeDeps);
    for (const dep of Object.keys(internalPkg.dependencies)) {
        if (excluded.has(dep)) {
            continue;
        }
        const depSrc = path.resolve(MONOREPO_ROOT, "node_modules", dep);
        const depDest = path.resolve(nodeModulesDir, dep);
        if (await fs.pathExists(depSrc)) {
            await safeRemove(layerDir, depDest);
            await fs.copy(depSrc, depDest, { overwrite: true });
        }
    }
}

/**
 * @param {string} layerDir
 * @param {string} nodejsDir
 */
async function pruneGameslibLayer(layerDir, nodejsDir) {
    console.log("Pruning renderer/chromium from gameslib layer...");
    const packagesToRemove = [
        path.join(nodejsDir, "node_modules", "@abstractplay", "renderer"),
        path.join(nodejsDir, "node_modules", "@sparticuz", "chromium"),
        path.join(nodejsDir, "node_modules", "puppeteer-core"),
    ];
    for (const pkgPath of packagesToRemove) {
        await safeRemove(layerDir, pkgPath);
    }

    const gameslibDir = path.join(nodejsDir, "node_modules", "@abstractplay", "gameslib");
    for (const item of ["docs", "README.md"]) {
        await safeRemove(layerDir, path.join(gameslibDir, item));
    }

    const sourceLocalesEn = path.resolve(
        MONOREPO_ROOT,
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
}

/**
 * @param {{
 *   dir: string;
 *   packages: string[];
 *   overridePackages?: string[];
 *   excludeDeps?: string[];
 *   postInstall?: (layerDir: string, nodejsDir: string, nodeModulesDir: string) => Promise<void>;
 * }} config
 */
async function createLayer(config) {
    const layerDir = path.resolve(CRONS_ROOT, `.serverless/layers/${config.dir}`);
    const nodejsDir = path.join(layerDir, "nodejs");
    const nodeModulesDir = path.join(nodejsDir, "node_modules");

    console.log(`Creating ${config.dir} layer...`);

    await fs.emptyDir(layerDir);
    await fs.ensureDir(nodejsDir);

    await fs.writeFile(
        path.join(nodejsDir, "build-info.txt"),
        `Build time: ${new Date().toISOString()}`,
    );

    const layerPackageJson = {
        type: "module",
        dependencies: {},
    };

    const lockVersions = getLockfileVersions(MONOREPO_ROOT, config.packages);

    for (const pkg of config.packages) {
        const version = lockVersions[pkg];
        if (!version) {
            throw new Error(`Could not find ${pkg} in package-lock.json (run npm run sync-deps first)`);
        }
        layerPackageJson.dependencies[pkg] = version;
    }

    await fs.writeJson(path.join(nodejsDir, "package.json"), layerPackageJson, { spaces: 2 });

    const npmrcPath = path.join(MONOREPO_ROOT, ".npmrc");
    if (await fs.pathExists(npmrcPath)) {
        await fs.copy(npmrcPath, path.join(nodejsDir, ".npmrc"));
    }

    console.log(`Installing dependencies for ${config.dir} layer...`);
    execSync("npm install --omit=dev --no-package-lock", {
        cwd: nodejsDir,
        stdio: "inherit",
    });

    await assertUnderLayer(layerDir, nodeModulesDir);

    for (const name of config.overridePackages ?? []) {
        await syncPackageDeps(layerDir, nodeModulesDir, name, config.excludeDeps ?? []);
    }

    if (config.postInstall) {
        await config.postInstall(layerDir, nodejsDir, nodeModulesDir);
    }

    for (const name of config.overridePackages ?? []) {
        const pkgPath = path.join(nodeModulesDir, ...name.split("/"));
        await trimApPackage(layerDir, pkgPath);
    }

    console.log(`Aggressively pruning node_modules for ${config.dir} layer...`);
    await pruneLayerNodeModules(layerDir, nodeModulesDir);

    const size = await dirSize(layerDir);
    console.log(`${config.dir} layer size: ${formatBytes(size)} (${size} bytes)`);
    if (size >= LAYER_UNZIPPED_LIMIT) {
        throw new Error(
            `${config.dir} layer exceeds the ${formatBytes(LAYER_UNZIPPED_LIMIT)} Lambda unzipped limit`,
        );
    }

    console.log(`✅ ${config.dir} layer created successfully in .serverless/layers/${config.dir}`);
}

/** @type {Array<Parameters<typeof createLayer>[0]>} */
const LAYERS = [
    {
        dir: "abstractplay-gameslib",
        packages: ["@abstractplay/gameslib", "@abstractplay/recranks"],
        overridePackages: ["@abstractplay/gameslib"],
        excludeDeps: ["@abstractplay/renderer", "puppeteer-core", "@sparticuz/chromium"],
        postInstall: pruneGameslibLayer,
    },
    {
        dir: "abstractplay-renderer",
        packages: ["@abstractplay/renderer"],
        overridePackages: ["@abstractplay/renderer"],
        excludeDeps: ["@abstractplay/gameslib", "puppeteer-core", "@sparticuz/chromium"],
    },
    {
        dir: "abstractplay-chromium",
        packages: ["puppeteer-core", "@sparticuz/chromium"],
    },
];

async function main() {
    for (const layer of LAYERS) {
        await createLayer(layer);
    }
}

main().catch((err) => {
    console.error("Error creating layers:", err);
    process.exit(1);
});
