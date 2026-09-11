import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import {
  defaultAttachmentCleanupConfig,
  runFeedbackAttachmentCleanupJob,
} from '../lib/feedback/attachmentCleanup.js';

const REGION = 'us-east-1';
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3Client = new S3Client({ region: REGION });

export const handler: Handler = async () => {
  const tableName = process.env.FEEDBACK_TABLE;
  if (!tableName) {
    throw new Error('FEEDBACK_TABLE is required');
  }
  process.env.FEEDBACK_ATTACHMENTS_BUCKET = process.env.FEEDBACK_ATTACHMENTS_BUCKET
    ?? `ap-feedback-attachments-${process.env.SLS_STAGE ?? 'dev'}`;

  const summary = await runFeedbackAttachmentCleanupJob(
    ddbDocClient,
    s3Client,
    tableName,
    defaultAttachmentCleanupConfig(),
  );
  console.log('feedback-attachment-cleanup summary:', JSON.stringify(summary));
  return summary;
};
