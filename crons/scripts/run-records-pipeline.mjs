/**
 * @deprecated Use bin/run-records-pipeline.mjs (npm run run-records-pipeline).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "run-records-pipeline.mjs");
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
