import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CloudWatchClient, GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";

/** Must match `service` in serverless.yml */
export const CRONS_LAMBDA_SERVICE = "abstract-play-backend-crons";

/** Lambda timeout is 900s; CLI must not time out earlier (Serverless SDK retries caused duplicate runs). */
export const LAMBDA_SYNC_READ_TIMEOUT_SEC = 960;

const REGION = "us-east-1";
const cloudwatch = new CloudWatchClient({ region: REGION });

export function cronsLambdaFunctionName(stage, shortName) {
    return `${CRONS_LAMBDA_SERVICE}-${stage}-${shortName}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until no concurrent executions (best-effort; metrics lag ~1–2 min).
 */
export async function waitForLambdaIdle(functionName, {
    pollIntervalMs = 30_000,
    maxWaitMs = 3_600_000,
} = {}) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        const end = new Date();
        const start = new Date(end.getTime() - 5 * 60_000);
        const { Datapoints } = await cloudwatch.send(new GetMetricStatisticsCommand({
            Namespace: "AWS/Lambda",
            MetricName: "ConcurrentExecutions",
            Dimensions: [{ Name: "FunctionName", Value: functionName }],
            StartTime: start,
            EndTime: end,
            Period: 60,
            Statistics: ["Maximum"],
        }));
        const peak = Datapoints?.reduce((m, d) => Math.max(m, d.Maximum ?? 0), 0) ?? 0;
        if (peak < 0.5) {
            return;
        }
        console.warn(
            `[wait] ${functionName} still has concurrent executions (peak ${peak} in last 5m); `
            + `retrying in ${pollIntervalMs / 1000}s…`,
        );
        await sleep(pollIntervalMs);
    }
    throw new Error(`Timed out after ${maxWaitMs}ms waiting for ${functionName} to become idle`);
}

/**
 * Synchronous RequestResponse invoke via AWS CLI (no Serverless SDK retry storm).
 */
export function invokeLambdaSync(stage, shortName, {
    readTimeoutSec = LAMBDA_SYNC_READ_TIMEOUT_SEC,
    payload = "{}",
} = {}) {
    const functionName = cronsLambdaFunctionName(stage, shortName);
    const workDir = mkdtempSync(join(tmpdir(), "ap-lambda-invoke-"));
    const outPath = join(workDir, "out.json");

    try {
        console.log(`>>> aws lambda invoke --function-name ${functionName} (read timeout ${readTimeoutSec}s)`);
        execFileSync(
            "aws",
            [
                "lambda",
                "invoke",
                "--function-name",
                functionName,
                "--invocation-type",
                "RequestResponse",
                "--cli-read-timeout",
                String(readTimeoutSec),
                "--cli-connect-timeout",
                "60",
                "--log-type",
                "Tail",
                "--payload",
                payload,
                outPath,
            ],
            { stdio: "inherit", env: process.env },
        );

        const raw = readFileSync(outPath, "utf8");
        let body;
        try {
            body = JSON.parse(raw);
        } catch {
            throw new Error(`Lambda returned non-JSON payload from ${functionName}: ${raw.slice(0, 500)}`);
        }
        if (body.errorMessage || body.errorType) {
            throw new Error(
                `Lambda ${functionName} failed: ${body.errorType ?? "Error"}: ${body.errorMessage ?? raw}`,
            );
        }
        return body;
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}
