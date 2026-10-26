#!/usr/bin/env npx tsx
/**
 * Reconcile LADDERPLAYER.activeLadderGameCount vs open ladder games.
 * Run: npx tsx scripts/reconcile-ladder-active-counts.ts --dry-run
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { reconcileLadderActiveCounts } from '../lib/ladders/reconcileActiveCounts.js';
import { writeLadderReconcileReport } from '../crons/src/utils/ladderOpsS3.js';

const REGION = 'us-east-1';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || !args.has('--live');
const ladderIdx = process.argv.indexOf('--ladderId');
const ladderId = ladderIdx >= 0 ? process.argv[ladderIdx + 1] : undefined;
const writeS3 = !args.has('--no-s3') && !dryRun;

async function main() {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    console.error('ABSTRACT_PLAY_TABLE is required');
    process.exit(1);
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const report = await reconcileLadderActiveCounts(client, tableName, {
    fix: !dryRun,
    ladderId,
  });
  console.log(JSON.stringify(report, null, 2));
  if (writeS3) {
    await writeLadderReconcileReport(report, { writeS3: true });
    console.log('Wrote ops S3 reconcile artifacts');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
