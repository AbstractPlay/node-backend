'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import { runLadderDecayPass } from '@backend/lib/ladders/decay.js';

const REGION = 'us-east-1';

export const handler: Handler = async () => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (tableName === undefined) {
    throw new Error('ABSTRACT_PLAY_TABLE is required');
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const result = await runLadderDecayPass(client, tableName);
  console.log(JSON.stringify({ job: 'ladder-decay', ...result }));
  return result;
};
