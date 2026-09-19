/**
 * Read-only preview of inactive-challenge-cleanup candidates (no DynamoDB writes).
 *
 * Usage: npm run preview-inactive-challenges -- --stage prod [--days 14]
 */
import { parseArgs } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { discoverInactiveIssuerChallenges } from "../src/lib/inactiveChallengeDiscovery.js";

const { values } = parseArgs({
    options: {
        stage: { type: "string", default: "dev" },
        days: { type: "string", default: "14" },
    },
});

const stage = values.stage ?? "dev";
const days = Number(values.days ?? "14");
if (!Number.isFinite(days) || days <= 0) {
    throw new Error("--days must be a positive number");
}

const tableName = `abstract-play-${stage}`;
const profile = stage === "prod" ? "AbstractPlayProd" : "AbstractPlayDev";
process.env.AWS_PROFILE = profile;

const inactiveBeforeMs = Date.now() - days * 24 * 60 * 60 * 1000;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

const discovery = await discoverInactiveIssuerChallenges(ddb, tableName, inactiveBeforeMs);

console.log(
    JSON.stringify(
        {
            tableName,
            inactiveDays: days,
            inactiveBeforeMs,
            inactiveUsers: discovery.inactiveUsers,
            openChallengesScanned: discovery.openChallengesScanned,
            candidateCount: discovery.candidates.length,
            candidates: discovery.candidates.map((c) => ({
                kind: c.kind,
                metaGame: c.metaGame,
                id: c.id,
                issuerId: c.issuerId,
            })),
        },
        null,
        2,
    ),
);
