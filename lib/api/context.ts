import { ddbDocClient } from '../ddb.js';
import { cognitoClient, s3Client, sesClient, sqsClient } from './clients.js';

export type ApiContext = {
  ddb: typeof ddbDocClient;
  s3: typeof s3Client;
  ses: typeof sesClient;
  sqs: typeof sqsClient;
  cognito: typeof cognitoClient;
  table: string;
  feedbackTable: string;
};

export function buildApiContext(): ApiContext {
  return {
    ddb: ddbDocClient,
    s3: s3Client,
    ses: sesClient,
    sqs: sqsClient,
    cognito: cognitoClient,
    table: process.env.ABSTRACT_PLAY_TABLE!,
    feedbackTable: process.env.FEEDBACK_TABLE!,
  };
}
