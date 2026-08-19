#!/usr/bin/env node
/* eslint-env node */
/**
 * Start a DynamoDB point-in-time restore of abstract-play-prod to a new table.
 *
 * PITR is enabled on prod only. This script does not modify the source table.
 *
 * Usage:
 *   node bin/restore-pitr.mjs <iso-timestamp> [target-table]
 *   node bin/restore-pitr.mjs --at <iso-timestamp> [--target <table-name>]
 *
 * Examples:
 *   node bin/restore-pitr.mjs 2026-08-19T00:14:35.850Z
 *   node bin/restore-pitr.mjs 2026-08-19T00:14:35.850Z abstract-play-prod-restored
 *
 * Requires AWS profile AbstractPlayProd (see serverless.yml).
 */
import {
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
  DynamoDBClient,
  RestoreTableToPointInTimeCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'us-east-1';
const PROFILE = 'AbstractPlayProd';
const SOURCE_TABLE = 'abstract-play-prod';
const DEFAULT_TARGET_TABLE = 'abstract-play-prod-restored';

function usage() {
  console.error(`Usage: node bin/restore-pitr.mjs <iso-timestamp> [target-table]
       node bin/restore-pitr.mjs --at <iso-timestamp> [--target <table-name>]

Options:
  --at <iso-timestamp>   Restore to this UTC instant (required)
  --target <name>        New table name (default: ${DEFAULT_TARGET_TABLE})
  --help, -h             Show this help

Source table: ${SOURCE_TABLE} (${REGION}, profile ${PROFILE})
`);
  process.exit(1);
}

function parseArgs(argv) {
  let restoreAt;
  let targetTable = DEFAULT_TARGET_TABLE;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--at' && argv[i + 1]) {
      restoreAt = argv[++i];
    } else if (arg === '--target' && argv[i + 1]) {
      targetTable = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg.startsWith('-')) {
      console.error(`Unknown argument: ${arg}`);
      usage();
    } else if (!restoreAt) {
      restoreAt = arg;
    } else if (targetTable === DEFAULT_TARGET_TABLE) {
      targetTable = arg;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      usage();
    }
  }

  if (!restoreAt) {
    console.error('Missing required ISO timestamp.');
    usage();
  }

  const restoreDate = new Date(restoreAt);
  if (Number.isNaN(restoreDate.getTime())) {
    console.error(`Invalid ISO timestamp: ${restoreAt}`);
    process.exit(1);
  }

  if (targetTable === SOURCE_TABLE) {
    console.error('Target table must differ from the source table.');
    process.exit(1);
  }

  return { restoreDate, restoreAt, targetTable };
}

function createClient() {
  return new DynamoDBClient({
    region: REGION,
    profile: PROFILE,
  });
}

function formatDate(date) {
  return date.toISOString();
}

async function assertRestorableWindow(client, restoreDate) {
  const response = await client.send(new DescribeContinuousBackupsCommand({
    TableName: SOURCE_TABLE,
  }));

  const pitr = response.ContinuousBackupsDescription?.PointInTimeRecoveryDescription;
  if (pitr?.PointInTimeRecoveryStatus !== 'ENABLED') {
    console.error(`PITR is not enabled on ${SOURCE_TABLE}.`);
    process.exit(1);
  }

  const earliest = pitr.EarliestRestorableDateTime;
  const latest = pitr.LatestRestorableDateTime;
  if (!earliest || !latest) {
    console.error('Could not read the restorable time window from DynamoDB.');
    process.exit(1);
  }

  if (restoreDate < earliest || restoreDate > latest) {
    console.error('Restore timestamp is outside the restorable window.');
    console.error(`  requested: ${formatDate(restoreDate)}`);
    console.error(`  earliest:  ${formatDate(earliest)}`);
    console.error(`  latest:    ${formatDate(latest)}`);
    process.exit(1);
  }

  return { earliest, latest };
}

async function assertTargetAvailable(client, targetTable) {
  try {
    await client.send(new DescribeTableCommand({ TableName: targetTable }));
    console.error(`Target table already exists: ${targetTable}`);
    process.exit(1);
  } catch (err) {
    if (err?.name !== 'ResourceNotFoundException') {
      throw err;
    }
  }
}

async function main() {
  const { restoreDate, restoreAt, targetTable } = parseArgs(process.argv);
  const client = createClient();

  const { earliest, latest } = await assertRestorableWindow(client, restoreDate);
  await assertTargetAvailable(client, targetTable);

  console.error(`Source:  ${SOURCE_TABLE}`);
  console.error(`Target:  ${targetTable}`);
  console.error(`Restore: ${restoreAt} (${formatDate(restoreDate)})`);
  console.error(`Window:  ${formatDate(earliest)} .. ${formatDate(latest)}`);

  const response = await client.send(new RestoreTableToPointInTimeCommand({
    SourceTableName: SOURCE_TABLE,
    TargetTableName: targetTable,
    RestoreDateTime: restoreDate,
    UseLatestRestorableTime: false,
  }));

  const table = response.TableDescription;
  console.log(JSON.stringify({
    sourceTable: SOURCE_TABLE,
    targetTable,
    restoreDateTime: formatDate(restoreDate),
    tableStatus: table?.TableStatus,
    tableArn: table?.TableArn,
    creationDateTime: table?.CreationDateTime?.toISOString?.() ?? table?.CreationDateTime,
  }, null, 2));

  console.error('');
  console.error('Restore started. Poll until ACTIVE:');
  console.error(`  aws dynamodb describe-table --table-name ${targetTable} --region ${REGION} --profile ${PROFILE} --query "Table.TableStatus"`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
