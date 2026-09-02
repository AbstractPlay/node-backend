import type { DynamoDBStreamEvent } from 'aws-lambda';
import { ddbDocClient } from '../lib/ddb.js';
import { processGameStreamRecord } from '../lib/gameProjector.js';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE is not set');
  }

  for (const record of event.Records) {
    await processGameStreamRecord(ddbDocClient, tableName, record);
  }
};
