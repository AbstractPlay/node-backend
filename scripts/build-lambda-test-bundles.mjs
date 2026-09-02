import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as esbuild from "esbuild";
import {
  LAMBDA_HANDLER_ENTRIES,
  lambdaEsbuildOptions,
} from "./lambda-esbuild-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = path.join(ROOT, ".test-artifacts", "lambda-bundles");

const entryPoints = Object.fromEntries(
  LAMBDA_HANDLER_ENTRIES.map((entry) => {
    const rel = entry.replace(/\.ts$/, "");
    return [rel, path.join(ROOT, entry)];
  }),
);

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });

await esbuild.build(lambdaEsbuildOptions(entryPoints, OUTDIR));

console.log(
  `build-lambda-test-bundles: ${LAMBDA_HANDLER_ENTRIES.length} handler bundles -> ${path.relative(ROOT, OUTDIR)}`,
);
