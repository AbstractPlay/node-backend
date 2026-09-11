#!/usr/bin/env node
/**
 * Run the feedback attachment cleanup job locally (same logic as the Lambda).
 *
 * Usage:
 *   npm run feedback-attachment-cleanup -- --stage prod
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  defaultAttachmentCleanupConfig,
  runFeedbackAttachmentCleanupJob,
} from '../lib/feedback/attachmentCleanup.js';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

function bucketForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_ATTACHMENTS_BUCKET_PROD ?? 'ap-feedback-attachments-prod';
  }
  return process.env.FEEDBACK_ATTACHMENTS_BUCKET ?? 'ap-feedback-attachments-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  process.env.FEEDBACK_ATTACHMENTS_BUCKET = bucketForStage(args.stage);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});

  const summary = await runFeedbackAttachmentCleanupJob(
    client,
    s3,
    tableName,
    defaultAttachmentCleanupConfig(),
  );
  console.log(`feedback-attachment-cleanup (${args.stage}, ${tableName}):`, JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
