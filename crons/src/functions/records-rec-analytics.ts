'use strict';

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import {
    type AnalyticsSlice,
    type AnalyticsState,
    type AnalyticsSummary,
    type RawDdbItem,
    RECOMMENDS_PK_PREFIX,
    WATERMARK_OVERLAP_MS,
    FIRST_RUN_LOOKBACK_MS,
    DAILY_RETENTION_DAYS,
    aggregateEvents,
    buildAnalyticsSummary,
    buildMarkdownReport,
    buildRollingSlice,
    ingestRawItems,
    itemDedupeKey,
    mergeSlices,
    parseSkEpochMs,
    pruneProcessedKeys,
    utcDateKey,
} from "../utils/recAnalytics.js";

const REGION = "us-east-1";
const OPS_BUCKET = "private-ops-153672715141-us-east-1-an";
const ANALYTICS_PREFIX = "recommendations/analytics";
const STATE_KEY = `${ANALYTICS_PREFIX}/_state.json`;
const SUMMARY_KEY = `${ANALYTICS_PREFIX}/summary.json`;

const s3 = new S3Client({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
    unmarshallOptions: { wrapNumbers: false },
});

async function readJsonFromS3<T>(key: string): Promise<T | null> {
    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: OPS_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (body === undefined || body.length === 0) {
            return null;
        }
        return JSON.parse(body) as T;
    } catch (err) {
        const code = (err as { name?: string }).name;
        if (code === "NoSuchKey" || code === "NotFound") {
            return null;
        }
        throw err;
    }
}

async function writeJsonToS3(key: string, value: unknown): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: OPS_BUCKET,
        Key: key,
        Body: JSON.stringify(value, null, 2),
        ContentType: "application/json",
    }));
}

async function writeTextToS3(key: string, body: string): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: OPS_BUCKET,
        Key: key,
        Body: body,
        ContentType: "text/markdown; charset=utf-8",
    }));
}

async function loadAnalyticsState(nowMs: number): Promise<{ state: AnalyticsState; scanFromMs: number }> {
    const existing = await readJsonFromS3<AnalyticsState>(STATE_KEY);
    if (existing !== null) {
        const scanFromMs = Math.max(0, existing.lastSkWatermarkMs - WATERMARK_OVERLAP_MS);
        return { state: existing, scanFromMs };
    }
    return {
        state: {
            lastRunAt: new Date(0).toISOString(),
            lastSkWatermarkMs: nowMs - FIRST_RUN_LOOKBACK_MS,
        },
        scanFromMs: nowMs - FIRST_RUN_LOOKBACK_MS,
    };
}

async function scanRecommendationEvents(tableName: string, minSk: string): Promise<RawDdbItem[]> {
    const items: RawDdbItem[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const response = await ddbDocClient.send(new ScanCommand({
            TableName: tableName,
            FilterExpression: "begins_with(pk, :prefix) AND sk >= :minSk",
            ExpressionAttributeValues: {
                ":prefix": RECOMMENDS_PK_PREFIX,
                ":minSk": minSk,
            },
            ExclusiveStartKey: lastKey,
        }));
        if (response.Items !== undefined) {
            items.push(...(response.Items as RawDdbItem[]));
        }
        lastKey = response.LastEvaluatedKey;
    } while (lastKey !== undefined);

    return items;
}

async function listDailySliceKeys(): Promise<string[]> {
    const prefix = `${ANALYTICS_PREFIX}/daily/`;
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: OPS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));
        for (const obj of response.Contents ?? []) {
            if (obj.Key !== undefined && obj.Key.endsWith(".json")) {
                keys.push(obj.Key);
            }
        }
        continuationToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);

    return keys;
}

function dailyKeyForDate(date: string): string {
    return `${ANALYTICS_PREFIX}/daily/${date}.json`;
}

function dateFromDailyKey(key: string): string | null {
    const match = key.match(/\/daily\/(\d{4}-\d{2}-\d{2})\.json$/);
    return match?.[1] ?? null;
}

async function loadDailySlices(): Promise<Array<{ date: string; slice: AnalyticsSlice }>> {
    const keys = await listDailySliceKeys();
    const slices: Array<{ date: string; slice: AnalyticsSlice }> = [];

    for (const key of keys) {
        const date = dateFromDailyKey(key);
        if (date === null) {
            continue;
        }
        const slice = await readJsonFromS3<AnalyticsSlice>(key);
        if (slice !== null) {
            slices.push({ date, slice });
        }
    }

    slices.sort((a, b) => a.date.localeCompare(b.date));
    return slices;
}

function groupEventsByUtcDate(
    events: ReturnType<typeof ingestRawItems>["events"],
): Map<string, ReturnType<typeof ingestRawItems>["events"]> {
    const grouped = new Map<string, ReturnType<typeof ingestRawItems>["events"]>();
    for (const event of events) {
        const date = utcDateKey(event.eventTimeMs);
        const bucket = grouped.get(date);
        if (bucket !== undefined) {
            bucket.push(event);
        } else {
            grouped.set(date, [event]);
        }
    }
    return grouped;
}

function pruneRetentionDates(dates: string[], asOfDate: string): Set<string> {
    const cutoffMs = Date.parse(`${asOfDate}T00:00:00.000Z`) - (DAILY_RETENTION_DAYS - 1) * 86_400_000;
    const cutoffDate = utcDateKey(cutoffMs);
    return new Set(dates.filter((date) => date >= cutoffDate && date <= asOfDate));
}

export const handler: Handler = async () => {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (tableName === undefined || tableName.length === 0) {
        throw new Error("ABSTRACT_PLAY_TABLE is not set");
    }

    const nowMs = Date.now();
    const generatedAt = new Date(nowMs).toISOString();
    const runDate = utcDateKey(nowMs);
    const { state: previousState, scanFromMs } = await loadAnalyticsState(nowMs);
    const minSk = String(scanFromMs);

    console.log(`Scanning ${tableName} for ${RECOMMENDS_PK_PREFIX}* with sk >= ${minSk}`);

    const rawItems = await scanRecommendationEvents(tableName, minSk);
    console.log(`Scanned ${rawItems.length} recommendation event rows`);

    const processedKeySet = new Set(previousState.processedKeys ?? []);
    const newRawItems = rawItems.filter((item) => {
        const key = itemDedupeKey(item);
        return key !== null && !processedKeySet.has(key);
    });
    console.log(`${newRawItems.length} new events after pk#sk dedup (${rawItems.length - newRawItems.length} skipped)`);

    const { events: uniqueEvents, dataQuality: ingestQuality } = ingestRawItems(newRawItems);

    const windowSlice = aggregateEvents(uniqueEvents);
    windowSlice.generatedAt = generatedAt;
    windowSlice.window = {
        start: new Date(scanFromMs).toISOString(),
        end: generatedAt,
    };
    windowSlice.dataQuality.eventsSkipped += ingestQuality.eventsSkipped;
    windowSlice.dataQuality.parseErrors += ingestQuality.parseErrors;

    const eventsByDate = groupEventsByUtcDate(uniqueEvents);
    let dailySlices = await loadDailySlices();
    const dailyMap = new Map(dailySlices.map(({ date, slice }) => [date, slice]));

    for (const [date, dateEvents] of eventsByDate) {
        const incremental = aggregateEvents(dateEvents);
        const existing = dailyMap.get(date);
        const mergedDaily = existing !== undefined ? mergeSlices([existing, incremental]) : incremental;
        mergedDaily.generatedAt = generatedAt;
        dailyMap.set(date, mergedDaily);
        await writeJsonToS3(dailyKeyForDate(date), mergedDaily);
        console.log(`Wrote daily slice ${date} (${dateEvents.length} events this run)`);
    }

    dailySlices = [...dailyMap.entries()]
        .map(([date, slice]) => ({ date, slice }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const retainedDates = pruneRetentionDates(dailySlices.map(({ date }) => date), runDate);
    dailySlices = dailySlices.filter(({ date }) => retainedDates.has(date));

    const summaryBody: AnalyticsSummary = buildAnalyticsSummary(windowSlice, dailySlices, runDate);
    await writeJsonToS3(SUMMARY_KEY, summaryBody);

    const priorWeekEndMs = Date.parse(`${runDate}T00:00:00.000Z`) - 7 * 86_400_000;
    const priorWeekStartMs = priorWeekEndMs - 6 * 86_400_000;
    const priorWeekStart = utcDateKey(priorWeekStartMs);
    const priorWeekEnd = utcDateKey(priorWeekEndMs);
    const priorWeekDaily = dailySlices.filter(({ date }) => date >= priorWeekStart && date <= priorWeekEnd);
    const priorWeek = priorWeekDaily.length > 0
        ? buildRollingSlice(priorWeekDaily, priorWeekEnd, 7)
        : undefined;

    const report = buildMarkdownReport({
        runDate,
        summary: summaryBody,
        priorWeek,
    });
    await writeTextToS3(`${ANALYTICS_PREFIX}/report/${runDate}.md`, report);

    const maxEventMs = uniqueEvents.reduce((max, event) => Math.max(max, event.eventTimeMs), previousState.lastSkWatermarkMs);
    const newProcessedKeys = [
        ...processedKeySet,
        ...newRawItems.map((item) => itemDedupeKey(item)).filter((key): key is string => key !== null),
    ];
    const pruneBeforeMs = nowMs - DAILY_RETENTION_DAYS * 86_400_000;
    const newState: AnalyticsState = {
        lastRunAt: generatedAt,
        lastSkWatermarkMs: Math.max(previousState.lastSkWatermarkMs, maxEventMs, nowMs),
        processedKeys: pruneProcessedKeys(newProcessedKeys, pruneBeforeMs),
    };
    await writeJsonToS3(STATE_KEY, newState);

    console.log(
        `Wrote ${SUMMARY_KEY}: shows=${summaryBody.totals.shows}, `
        + `clicks=${summaryBody.totals.clicks}, challenges=${summaryBody.totals.challenges}`,
    );
    console.log("ALL DONE");
};
