'use strict';

import { DynamoDBClient, ExportTableToPointInTimeCommand, type ExportTableToPointInTimeInput } from "@aws-sdk/client-dynamodb";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";

const REGION = "us-east-1";
const DUMP_BUCKET = "abstractplay-db-dump";
const EXPORT_PREFIX = "AWSDynamoDB/";
const RETENTION_DAYS = 7;
const ddbClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

async function listAllObjects(bucket: string, prefix: string): Promise<_Object[]> {
    const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
    const allContents: _Object[] = [];
    let isTruncated = true;

    while (isTruncated) {
        const { Contents, IsTruncated, NextContinuationToken } = await s3Client.send(command);
        if (Contents === undefined) {
            throw new Error(`Could not list the bucket contents`);
        }
        allContents.push(...Contents);
        isTruncated = IsTruncated || false;
        command.input.ContinuationToken = NextContinuationToken;
    }

    return allContents;
}

async function pruneOldExports(retentionDays: number): Promise<void> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const allContents = await listAllObjects(DUMP_BUCKET, EXPORT_PREFIX);

    const exportTimes = new Map<string, number>();
    for (const obj of allContents) {
        if (!obj.Key?.endsWith("manifest-summary.json")) {
            continue;
        }
        const match = obj.Key.match(/^AWSDynamoDB\/([^/]+)\/manifest-summary\.json$/);
        if (match !== null && obj.LastModified !== undefined) {
            exportTimes.set(match[1], obj.LastModified.getTime());
        }
    }

    if (exportTimes.size === 0) {
        console.log("No exports found to prune");
        return;
    }

    const latestUid = [...exportTimes.entries()]
        .sort((a, b) => b[1] - a[1])[0]![0];

    const keysToDelete: string[] = [];
    for (const obj of allContents) {
        const match = obj.Key?.match(/^AWSDynamoDB\/([^/]+)\//);
        if (match === null || match === undefined) {
            continue;
        }
        const uid = match[1];
        const exportTime = exportTimes.get(uid);
        if (exportTime === undefined || uid === latestUid || exportTime >= cutoff) {
            continue;
        }
        keysToDelete.push(obj.Key!);
    }

    if (keysToDelete.length === 0) {
        console.log(`No exports older than ${retentionDays} days to delete`);
        return;
    }

    for (let i = 0; i < keysToDelete.length; i += 1000) {
        const batch = keysToDelete.slice(i, i + 1000);
        const response = await s3Client.send(new DeleteObjectsCommand({
            Bucket: DUMP_BUCKET,
            Delete: { Objects: batch.map(Key => ({ Key })) },
        }));
        console.log(`Deleted ${response.Deleted?.length ?? 0} objects`);
        if (response.Errors !== undefined && response.Errors.length > 0) {
            console.error(`Delete errors:\n${JSON.stringify(response.Errors, null, 2)}`);
        }
    }

    console.log(`Pruned ${keysToDelete.length} objects from exports older than ${retentionDays} days`);
}

export const handler: Handler = async (event: any, context?: any) => {
    const input: ExportTableToPointInTimeInput = {
        S3Bucket: DUMP_BUCKET,
        TableArn: "arn:aws:dynamodb:us-east-1:153672715141:table/abstract-play-prod",
        ExportFormat: "ION",
    }
    const cmd = new ExportTableToPointInTimeCommand(input);

    try {
        const response = await ddbClient.send(cmd);
        console.log(`Export command sent:\n${JSON.stringify(response, null, 2)}`)
    } catch (err) {
        console.log(err)
    }

    try {
        await pruneOldExports(RETENTION_DAYS);
    } catch (err) {
        console.error(err);
    }

    console.log("ALL DONE");
};
