'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import { reconcileLadderActiveCounts } from '@backend/lib/ladders/reconcileActiveCounts.js';
import { writeLadderReconcileReport } from '../utils/ladderOpsS3.js';

const REGION = 'us-east-1';

export const handler: Handler = async () => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (tableName === undefined) {
    throw new Error('ABSTRACT_PLAY_TABLE is required');
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const report = await reconcileLadderActiveCounts(client, tableName, { fix: true });
  await writeLadderReconcileReport(report, { writeS3: true });
  console.log(JSON.stringify({
    job: 'ladder-reconcile-counts',
    driftCorrections: report.driftCorrections,
    zeroDrift: report.zeroDrift,
    overCapIncidents: report.overCapIncidents,
    playersScanned: report.playersScanned,
  }));
  return report;
};
