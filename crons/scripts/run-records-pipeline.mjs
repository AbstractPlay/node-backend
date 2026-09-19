import { execSync } from "node:child_process";

/**
 * Invoke batch record pipeline Lambdas in dependency order (prod/dev).
 * Does not run dumpdb (async export) or SQS-driven workers.
 *
 * Usage: npm run run-records-pipeline -- --stage prod
 */

function readStage() {
    const idx = process.argv.indexOf("--stage");
    if (idx >= 0 && process.argv[idx + 1]) {
        return process.argv[idx + 1];
    }
    return "dev";
}

const stage = readStage();
const functions = [
    "records",
    "records-ttm",
    "records-move-times",
    "records-cooccur",
    "records-rec-analytics",
    "tournament-data",
    "records-manifest",
    "summarize",
    "player-summary-fanout",
    "records-manifest",
];

for (const name of functions) {
    console.log(`\n>>> serverless invoke -f ${name} --stage ${stage}`);
    execSync(`npx serverless invoke -f ${name} --stage ${stage}`, {
        stdio: "inherit",
        env: process.env,
    });
}

console.log("\nPipeline invoke sequence finished.");
