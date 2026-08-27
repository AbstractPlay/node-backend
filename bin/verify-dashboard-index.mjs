#!/usr/bin/env node
/* eslint-env node */
/**
 * Dashboard index health check (read-only).
 *
 * Validates stream-maintained indexes and USERGAME# overlays only.
 * Does NOT read USER.games[] for dashboard membership.
 *
 * Fails when:
 *   - CURRENTGAMES# row is not active (empty toMove)
 *   - Any RECENTCOMPLETED# row remains (legacy index retired; use purge-all-recent-completed)
 *   - USERGAME# row is not on CURRENTGAMES# (orphan overlay)
 *
 * Usage:
 *   node bin/verify-dashboard-index.mjs <userid> [userid...] [--stage dev|prod] [--verbose]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
  },
};

function usage() {
  console.error(`Usage: node bin/verify-dashboard-index.mjs <userid> [userid...] [--stage dev|prod] [--verbose]

Index-only dashboard verify (CURRENTGAMES#, USERGAME#; RECENTCOMPLETED# must be empty).

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --verbose          Print per-game details
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const userIds = [];
  let stage = 'dev';
  let verbose = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-')) {
      userIds.push(arg);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (userIds.length === 0) {
    usage();
  }
  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { userIds, stage, verbose };
}

function isActiveDashboardGame(game) {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

function summarizeOverlay(source) {
  const parts = [];
  if (source.seen !== undefined) {
    parts.push(`seen=${source.seen}`);
  }
  if (source.lastChat !== undefined) {
    parts.push(`lastChat=${source.lastChat}`);
  }
  return parts.join(', ');
}

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function verifyUser(docClient, table, userId, verbose) {
  const userData = await docClient.send(new GetCommand({
    TableName: table,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk, #name',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#name': 'name' },
  }));

  if (!userData.Item) {
    return {
      userId,
      name: '?',
      healthy: false,
      error: 'USER record not found',
    };
  }

  const currentGames = await queryPartition(docClient, table, `CURRENTGAMES#${userId}`);
  const recentCompletedGames = await queryPartition(docClient, table, `RECENTCOMPLETED#${userId}`);
  const userGameRows = await queryPartition(docClient, table, `USERGAME#${userId}`);

  const currentIds = new Set(currentGames.map(row => row.sk));

  const inactiveCurrentRows = currentGames.filter(row => !isActiveDashboardGame(row));
  const orphanUserGameRows = userGameRows.filter(row => !currentIds.has(row.sk));

  const currentRowsActive = inactiveCurrentRows.length === 0;
  const recentCompletedEmpty = recentCompletedGames.length === 0;
  const userGameOrphansClear = orphanUserGameRows.length === 0;

  const healthy = currentRowsActive
    && recentCompletedEmpty
    && userGameOrphansClear;

  const result = {
    userId,
    name: userData.Item.name ?? userId,
    healthy,
    checks: {
      currentRowsActive,
      recentCompletedEmpty,
      userGameOrphansClear,
    },
    counts: {
      currentGames: currentGames.length,
      recentCompleted: recentCompletedGames.length,
      userGameOverlays: userGameRows.length,
    },
    issues: [],
  };

  if (!currentRowsActive) {
    result.issues.push(`inactive CURRENTGAMES# (${inactiveCurrentRows.length})`);
  }
  if (!recentCompletedEmpty) {
    result.issues.push(`legacy RECENTCOMPLETED# (${recentCompletedGames.length})`);
  }
  if (!userGameOrphansClear) {
    result.issues.push(`USERGAME# orphans (${orphanUserGameRows.length})`);
  }

  if (verbose) {
    result.details = {
      inactiveCurrentRows,
      recentCompletedGames,
      orphanUserGameRows,
    };
  }

  return result;
}

function printUserReport(result, stage, table, verbose) {
  console.log(`User: ${result.name}`);
  console.log(`Id:   ${result.userId}`);
  console.log(`Stage: ${stage}  Table: ${table}`);
  if (result.error) {
    console.log(`ERROR: ${result.error}`);
    console.log(`DASHBOARD INDEX OK: NO`);
    console.log('');
    return;
  }

  const c = result.counts;
  const ch = result.checks;
  console.log('');
  console.log('Index counts:');
  console.log(`  CURRENTGAMES#:        ${c.currentGames}`);
  console.log(`  RECENTCOMPLETED#:     ${c.recentCompleted} (legacy; expect 0)`);
  console.log(`  USERGAME# overlays:   ${c.userGameOverlays}`);
  console.log('');
  console.log('Checks:');
  console.log(`  CURRENTGAMES# all active:   ${ch.currentRowsActive ? 'yes' : 'NO'}`);
  console.log(`  RECENTCOMPLETED# empty:     ${ch.recentCompletedEmpty ? 'yes' : 'NO'}`);
  console.log(`  USERGAME# no orphans:       ${ch.userGameOrphansClear ? 'yes' : 'NO'}`);
  console.log('');
  console.log(`DASHBOARD INDEX OK: ${result.healthy ? 'YES' : 'NO'}`);
  if (result.issues.length > 0) {
    console.log(`Issues: ${result.issues.join('; ')}`);
  }

  if (verbose && result.details) {
    if (result.details.inactiveCurrentRows.length > 0) {
      console.log('\nInactive CURRENTGAMES# rows:');
      for (const row of result.details.inactiveCurrentRows) {
        console.log(`  ${row.sk} (${row.metaGame}) toMove=${JSON.stringify(row.toMove)}`);
      }
    }
    if (result.details.recentCompletedGames.length > 0) {
      console.log('\nLegacy RECENTCOMPLETED# rows (should be purged):');
      for (const row of result.details.recentCompletedGames) {
        console.log(`  ${row.sk} (${row.metaGame})`);
      }
    }
    if (result.details.orphanUserGameRows.length > 0) {
      console.log('\nUSERGAME# orphan rows:');
      for (const row of result.details.orphanUserGameRows) {
        console.log(`  ${row.sk} (${summarizeOverlay(row)})`);
      }
    }
  }
  console.log('');
}

async function main() {
  const { userIds, stage, verbose } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const client = new DynamoDBClient({
    region: 'us-east-1',
    profile,
  });
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  const results = [];
  const multi = userIds.length > 1;

  for (const userId of userIds) {
    if (multi) {
      console.log('═'.repeat(72));
    }
    const result = await verifyUser(docClient, table, userId, verbose);
    results.push(result);
    printUserReport(result, stage, table, verbose);
  }

  if (multi) {
    const healthy = results.filter(r => r.healthy).length;
    console.log('═'.repeat(72));
    console.log(`SUMMARY: ${healthy}/${results.length} DASHBOARD INDEX OK`);
    for (const r of results) {
      const status = r.healthy ? 'YES' : 'NO';
      const issues = r.issues?.length ? ` — ${r.issues.join('; ')}` : '';
      console.log(`  ${status}  ${r.name} (${r.userId})${issues}`);
    }
    console.log('');
  }

  const allHealthy = results.every(r => r.healthy);
  process.exit(allHealthy ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
