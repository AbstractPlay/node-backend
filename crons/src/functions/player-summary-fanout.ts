import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import type { Handler } from "aws-lambda";
import {
    PLAYER_SUMMARY_MANIFEST_KEY,
    SUMMARY_PLAYERS_KEY,
    SUMMARY_RATINGS_KEY,
    SUMMARY_SITE_KEY,
} from "../constants/recordsBucket.js";
import { planPlayerSummaryFanout } from "./playerSummaryFanoutPlan.js";
import { enqueuePlayerSummaryWrites } from "./playerSummaryQueue.js";
import type { StatSummarySite, StatSummaryPlayers, StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import {
    parsePreviousPlayerSummaryManifest,
    type PlayerSummaryManifest,
} from "types/playerSummaryQueue.js";
import { getRecordsJson, putRecordsJson, tryGetRecordsJson } from "../utils/recordsJson.js";

const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });
const sqs = new SQSClient({ region: REGION });

export type PlayerSummaryFanoutMetrics = {
    generated: string;
    candidateCount: number;
    enqueuedCount: number;
    skippedCount: number;
    inputUnchanged: boolean;
    tierBytesLoaded: number;
    manifestBytes: number;
};

export const handler: Handler = async (): Promise<PlayerSummaryFanoutMetrics> => {
    const queueUrl = process.env.PLAYER_SUMMARY_QUEUE_URL;
    if (queueUrl === undefined || queueUrl === "") {
        throw new Error("PLAYER_SUMMARY_QUEUE_URL is not configured");
    }

    const [siteResult, playersResult, ratingsResult, previousManifestResult] = await Promise.all([
        getRecordsJson<StatSummarySite>(s3, SUMMARY_SITE_KEY),
        getRecordsJson<StatSummaryPlayers>(s3, SUMMARY_PLAYERS_KEY),
        getRecordsJson<StatSummaryRatings>(s3, SUMMARY_RATINGS_KEY),
        tryGetRecordsJson<unknown>(s3, PLAYER_SUMMARY_MANIFEST_KEY),
    ]);

    const tierBytesLoaded = siteResult.bytes + playersResult.bytes + ratingsResult.bytes;
    console.log(
        `player-summary-fanout: loaded tiers (site=${siteResult.bytes}, `
        + `players=${playersResult.bytes}, ratings=${ratingsResult.bytes} bytes)`,
    );

    const generated = siteResult.data.generated;
    const previous = parsePreviousPlayerSummaryManifest(previousManifestResult?.data);

    const plan = planPlayerSummaryFanout({
        generated,
        playersTier: playersResult.data,
        ratingsTier: ratingsResult.data,
        previousHashes: previous.contentHashes,
        previousInputFingerprint: previous.inputFingerprint,
    });

    if (plan.inputUnchanged) {
        console.log("player-summary-fanout: input unchanged, skipping all enqueues");
    } else if (plan.enqueuedCount > 0) {
        console.log(`Enqueueing ${plan.enqueuedCount} player summary writes`);
        await enqueuePlayerSummaryWrites(sqs, queueUrl, plan.messages);
    }

    console.log(
        `player-summary-fanout: candidates=${plan.candidateCount} `
        + `enqueued=${plan.enqueuedCount} skipped=${plan.skippedCount} `
        + `inputUnchanged=${plan.inputUnchanged}`,
    );

    const manifest: PlayerSummaryManifest = {
        version: 2,
        generated,
        enqueuedAt: new Date().toISOString(),
        candidateCount: plan.candidateCount,
        expectedCount: plan.enqueuedCount,
        skippedCount: plan.skippedCount,
        inputFingerprint: plan.inputFingerprint,
        contentHashes: plan.contentHashes,
    };
    const manifestBytes = await putRecordsJson(s3, PLAYER_SUMMARY_MANIFEST_KEY, manifest);
    console.log(
        `Wrote ${PLAYER_SUMMARY_MANIFEST_KEY} (${manifestBytes} bytes, `
        + `expectedCount=${plan.enqueuedCount}, candidateCount=${plan.candidateCount})`,
    );

    return {
        generated,
        candidateCount: plan.candidateCount,
        enqueuedCount: plan.enqueuedCount,
        skippedCount: plan.skippedCount,
        inputUnchanged: plan.inputUnchanged,
        tierBytesLoaded,
        manifestBytes,
    };
};
