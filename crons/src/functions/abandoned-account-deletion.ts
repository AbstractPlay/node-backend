'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import {
  inactiveBeforeMsFromEnv,
  runAbandonedAccountDeletionForUser,
} from '@backend/lib/abandonedAccountDeletion.js';
import {
  collectAbandonedAccountDeletionCandidatesFromDump,
  findLatestDumpUid,
  listDumpBucketObjects,
} from '../utils/dumpExport.js';
import { isBotIdOnTable } from '@backend/lib/participants.js';

const REGION = 'us-east-1';
const DEFAULT_BATCH_SIZE = 25;

type Summary = {
  enabled: boolean;
  dryRun: boolean;
  exportUid: string;
  candidates: number;
  processed: number;
  deleted: number;
  skipped: Record<string, number>;
  deletedUsers: string[];
  errors: { userId: string; message: string }[];
};

export const handler: Handler = async () => {
  const enabled = process.env.ABANDONED_ACCOUNT_DELETE_ENABLED === 'true';
  const dryRun = process.env.ABANDONED_ACCOUNT_DELETE_DRY_RUN !== 'false';
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  const userPoolId = process.env.USERPOOL_ID;
  const feedbackTable = process.env.FEEDBACK_TABLE;

  const summary: Summary = {
    enabled,
    dryRun,
    exportUid: '',
    candidates: 0,
    processed: 0,
    deleted: 0,
    skipped: {},
    deletedUsers: [],
    errors: [],
  };

  if (!enabled) {
    console.log('abandoned-account-deletion: disabled (ABANDONED_ACCOUNT_DELETE_ENABLED != true)');
    return summary;
  }
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE is required');
  }
  if (!userPoolId && !dryRun) {
    throw new Error('USERPOOL_ID is required when not in dry-run mode');
  }

  const batchSize = Number(process.env.ABANDONED_ACCOUNT_DELETE_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  const inactiveBeforeMs = inactiveBeforeMsFromEnv();

  const s3 = new S3Client({ region: REGION });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const allContents = await listDumpBucketObjects(s3);
  const uid = findLatestDumpUid(allContents);
  summary.exportUid = uid;

  const dumpResult = await collectAbandonedAccountDeletionCandidatesFromDump(
    s3,
    allContents,
    uid,
    inactiveBeforeMs,
  );
  summary.candidates = dumpResult.candidates.length;
  console.log(
    `abandoned-account-deletion: ${dumpResult.candidates.length} dump candidates from export ${uid}`,
  );

  const bumpSkip = (reason: string) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
  };

  for (const candidate of dumpResult.candidates.slice(0, batchSize)) {
    summary.processed += 1;
    const { userId } = candidate;
    try {
      if (await isBotIdOnTable(ddb, tableName, userId)) {
        bumpSkip('bot');
        continue;
      }

      const result = await runAbandonedAccountDeletionForUser(ddb, tableName, userId, {
        inactiveBeforeMs,
        userPoolId,
        dryRun,
        feedbackTableName: feedbackTable,
      });

      if (result.status === 'deleted') {
        summary.deleted += 1;
        summary.deletedUsers.push(userId);
        console.log(`abandoned-account-deletion: ${dryRun ? 'would delete' : 'deleted'} ${userId}`, result.detach);
      } else {
        bumpSkip(result.reason);
      }
    } catch (error) {
      bumpSkip('error');
      summary.errors.push({
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error(`abandoned-account-deletion: error for ${userId}`, error);
    }
  }

  console.log('abandoned-account-deletion summary', summary);
  return summary;
};
