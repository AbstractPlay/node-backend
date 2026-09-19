'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import { cleanupUserDashboardCruft } from '../utils/dashboardCruftCleanup.js';
import {
  collectUserCandidatesFromDump,
  findLatestDumpUid,
  listDumpBucketObjects,
} from '../utils/dumpExport.js';

const REGION = 'us-east-1';
const DEFAULT_INACTIVE_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 75;

type SkipReason =
  | 'stale_dump'
  | 'already_cleaned'
  | 'active_since_dump'
  | 'bot'
  | 'no_cruft'
  | 'error';

type Summary = {
  candidates: number;
  processed: number;
  skipped: Record<SkipReason, number>;
  cleanedUsers: string[];
  errors: { userId: string; message: string }[];
};

async function isBotId(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'BOT', sk: userId },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}

export const handler: Handler = async () => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE is required');
  }

  const inactiveMs = Number(process.env.ABANDONED_ACCOUNT_INACTIVE_MS ?? DEFAULT_INACTIVE_MS);
  const batchSize = Number(process.env.DASHBOARD_CRUFT_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  const now = Date.now();
  const inactiveBeforeMs = now - inactiveMs;

  const s3 = new S3Client({ region: REGION });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const summary: Summary = {
    candidates: 0,
    processed: 0,
    skipped: {
      stale_dump: 0,
      already_cleaned: 0,
      active_since_dump: 0,
      bot: 0,
      no_cruft: 0,
      error: 0,
    },
    cleanedUsers: [],
    errors: [],
  };

  const allContents = await listDumpBucketObjects(s3);
  const uid = findLatestDumpUid(allContents);
  const candidates = await collectUserCandidatesFromDump(s3, allContents, uid, inactiveBeforeMs);
  summary.candidates = candidates.length;
  console.log(`dashboard-cruft-cleanup: ${candidates.length} dump candidates from export ${uid}`);

  for (const userId of candidates.slice(0, batchSize)) {
    try {
      const user = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        ProjectionExpression: 'lastSeen, cleaned',
      }));
      if (user.Item === undefined) {
        summary.skipped.stale_dump += 1;
        continue;
      }
      if (user.Item.cleaned === true) {
        summary.skipped.already_cleaned += 1;
        continue;
      }
      const lastSeen = user.Item.lastSeen;
      if (typeof lastSeen !== 'number' || lastSeen >= inactiveBeforeMs) {
        summary.skipped.active_since_dump += 1;
        continue;
      }
      if (await isBotId(ddb, tableName, userId)) {
        summary.skipped.bot += 1;
        continue;
      }

      const stats = await cleanupUserDashboardCruft(ddb, tableName, userId, now);
      if (stats.recentCompletedDeleted === 0 && stats.userGameDeleted === 0) {
        summary.skipped.no_cruft += 1;
        continue;
      }

      await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        UpdateExpression: 'SET cleaned = :true',
        ExpressionAttributeValues: { ':true': true },
      }));

      summary.processed += 1;
      summary.cleanedUsers.push(userId);
      console.log(`dashboard-cruft-cleanup: cleaned ${userId}`, stats);
    } catch (error) {
      summary.skipped.error += 1;
      summary.errors.push({
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`dashboard-cruft-cleanup: error for ${userId}`, error);
    }
  }

  console.log('dashboard-cruft-cleanup summary', summary);
  return summary;
};
