import { acquirePipelineLock, releasePipelineLock } from "./pipeline-lock.mjs";
import { invokeLambdaSync, waitForLambdaIdle, cronsLambdaFunctionName } from "./lambda-invoke.mjs";

/**
 * Invoke batch record pipeline Lambdas in dependency order (prod/dev).
 * Does not run dumpdb (async export) or SQS-driven workers.
 *
 * Uses AWS CLI invoke with a long read timeout so the client does not retry
 * while Lambda is still running (which previously caused overlapping prod runs).
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

let lock;
try {
    lock = acquirePipelineLock(stage);
    console.log(`Pipeline lock acquired (${lock.path})`);

    for (const name of functions) {
        const functionName = cronsLambdaFunctionName(stage, name);
        await waitForLambdaIdle(functionName);
        invokeLambdaSync(stage, name);
    }

    console.log("\nPipeline invoke sequence finished.");
} finally {
    releasePipelineLock(lock);
}
