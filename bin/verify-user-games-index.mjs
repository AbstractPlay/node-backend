#!/usr/bin/env node
/* eslint-env node */
/**
 * Verify a user's dashboard index health (Phase 3+).
 *
 * CURRENTGAMES# — active game summaries (stream-maintained):
 *   - Count and ids vs USER.games[] active games
 *   - numMoves vs legacy active entries
 *
 * USERGAME# — overlay source of truth for seen / lastChat (Phase 3 reads here first):
 *   - Every row must belong to a game on the user's dashboard
 *   - Legacy USER.games[] must have a USERGAME# row when it still carries overlay fields
 *   - Index-only overlays (USERGAME# without legacy seen/lastChat) are expected after moves
 *   - When both stores have a field, values should match (dual-write drift)
 *
 * Usage:
 *   node bin/verify-user-games-index.mjs <userid> [--stage dev|prod] [--verbose]
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
  console.error(`Usage: node bin/verify-user-games-index.mjs <userid> [--stage dev|prod] [--verbose]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --verbose          Print per-game details (including expected index-only overlays)
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let userId;
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
      userId = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!userId) {
    usage();
  }
  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { userId, stage, verbose };
}

function isActiveDashboardGame(game) {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

function hasLegacyOverlayFields(game) {
  return game.seen !== undefined || game.lastChat !== undefined;
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

function compareOverlayFields(legacy, indexRow) {
  const mismatches = [];
  if (legacy.seen !== undefined && indexRow.seen !== undefined && legacy.seen !== indexRow.seen) {
    mismatches.push(`seen legacy=${legacy.seen} index=${indexRow.seen}`);
  }
  if (legacy.lastChat !== undefined && indexRow.lastChat !== undefined && legacy.lastChat !== indexRow.lastChat) {
    mismatches.push(`lastChat legacy=${legacy.lastChat} index=${indexRow.lastChat}`);
  }
  return mismatches;
}

async function main() {
  const { userId, stage, verbose } = parseArgs(process.argv);
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

  const userData = await docClient.send(new GetCommand({
    TableName: table,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk, #name, games',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#name': 'name' },
  }));

  if (!userData.Item) {
    console.error(`No USER record found for ${userId}`);
    process.exit(1);
  }

  const games = userData.Item.games ?? [];
  const activeGames = games.filter(isActiveDashboardGame);
  const legacyOverlayGames = games.filter(hasLegacyOverlayFields);

  const currentGames = await queryPartition(docClient, table, `CURRENTGAMES#${userId}`);
  const userGameRows = await queryPartition(docClient, table, `USERGAME#${userId}`);

  const legacyById = new Map(games.map(g => [g.id, g]));
  const currentById = new Map(currentGames.map(row => [row.sk, row]));
  const userGameById = new Map(userGameRows.map(row => [row.sk, row]));

  const dashboardIds = new Set([
    ...games.map(g => g.id),
    ...currentGames.map(row => row.sk),
  ]);

  const activeIds = new Set(activeGames.map(g => g.id));
  const currentIds = new Set(currentGames.map(g => g.sk));

  const missingFromCurrent = [...activeIds].filter(id => !currentIds.has(id));
  const extraInCurrent = [...currentIds].filter(id => !activeIds.has(id));

  const numMovesMismatches = [];
  for (const game of activeGames) {
    const row = currentById.get(game.id);
    if (!row) {
      continue;
    }
    const legacyMoves = game.numMoves ?? 0;
    const indexMoves = row.numMoves ?? 0;
    if (legacyMoves !== indexMoves) {
      numMovesMismatches.push({
        id: game.id,
        metaGame: game.metaGame,
        legacyMoves,
        indexMoves,
      });
    }
  }

  const orphanUserGameRows = userGameRows.filter(row => !dashboardIds.has(row.sk));

  const missingUserGameOverlays = legacyOverlayGames.filter(
    game => !userGameById.has(game.id),
  );

  const indexOnlyOverlays = userGameRows.filter(row => {
    if (!dashboardIds.has(row.sk)) {
      return false;
    }
    const legacy = legacyById.get(row.sk);
    return !legacy || !hasLegacyOverlayFields(legacy);
  });

  const overlayValueMismatches = [];
  for (const game of legacyOverlayGames) {
    const indexRow = userGameById.get(game.id);
    if (!indexRow) {
      continue;
    }
    const fieldMismatches = compareOverlayFields(game, indexRow);
    if (fieldMismatches.length > 0) {
      overlayValueMismatches.push({
        id: game.id,
        metaGame: game.metaGame,
        details: fieldMismatches.join('; '),
      });
    }
  }

  const currentCountMatch = activeGames.length === currentGames.length;
  const currentIdsMatch = missingFromCurrent.length === 0 && extraInCurrent.length === 0;
  const numMovesMatch = numMovesMismatches.length === 0;
  const userGameOrphansClear = orphanUserGameRows.length === 0;
  const userGameCoverageOk = missingUserGameOverlays.length === 0;
  const overlayValuesMatch = overlayValueMismatches.length === 0;

  const indexHealthy = currentCountMatch
    && currentIdsMatch
    && numMovesMatch
    && userGameOrphansClear
    && userGameCoverageOk
    && overlayValuesMatch;

  console.log(`User: ${userData.Item.name ?? userId}`);
  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log('');
  console.log('Counts:');
  console.log(`  USER.games total:                 ${games.length}`);
  console.log(`  USER.games active (toMove set):   ${activeGames.length}`);
  console.log(`  CURRENTGAMES# rows:               ${currentGames.length}`);
  console.log(`  USER.games legacy overlay fields: ${legacyOverlayGames.length}`);
  console.log(`  USERGAME# rows (index overlays):  ${userGameRows.length}`);
  console.log(`  USERGAME# index-only (expected):  ${indexOnlyOverlays.length}`);
  console.log('');
  console.log('CURRENTGAMES# (active games):');
  console.log(`  count match:  ${currentCountMatch ? 'yes' : 'NO'}`);
  console.log(`  id match:     ${currentIdsMatch ? 'yes' : 'NO'}`);
  console.log(`  numMoves:     ${numMovesMatch ? 'yes' : 'NO'}`);
  console.log('');
  console.log('USERGAME# (seen / lastChat — index is source of truth):');
  console.log(`  no orphan rows:        ${userGameOrphansClear ? 'yes' : 'NO'}`);
  console.log(`  legacy coverage:       ${userGameCoverageOk ? 'yes' : 'NO'}`);
  console.log(`  dual-write values:     ${overlayValuesMatch ? 'yes' : 'NO'}`);
  console.log('');
  console.log(`INDEX HEALTHY: ${indexHealthy ? 'YES' : 'NO'}`);

  const showDetails = verbose || !indexHealthy;

  if (showDetails) {
    if (numMovesMismatches.length > 0) {
      console.log('\nCURRENTGAMES# numMoves mismatch vs USER.games[]:');
      for (const row of numMovesMismatches) {
        console.log(`  ${row.id} (${row.metaGame}): legacy=${row.legacyMoves} index=${row.indexMoves}`);
      }
    }
    if (missingFromCurrent.length > 0) {
      console.log('\nActive in USER.games but missing from CURRENTGAMES#:');
      for (const id of missingFromCurrent) {
        const game = activeGames.find(g => g.id === id);
        console.log(`  ${id} (${game?.metaGame ?? 'unknown'})`);
      }
    }
    if (extraInCurrent.length > 0) {
      console.log('\nIn CURRENTGAMES# but not active in USER.games:');
      for (const id of extraInCurrent) {
        const row = currentGames.find(g => g.sk === id);
        console.log(`  ${id} (${row?.metaGame ?? 'unknown'})`);
      }
    }
    if (orphanUserGameRows.length > 0) {
      console.log('\nUSERGAME# orphan rows (not on dashboard — safe to delete):');
      for (const row of orphanUserGameRows) {
        console.log(`  ${row.sk} (${summarizeOverlay(row)})`);
      }
    }
    if (missingUserGameOverlays.length > 0) {
      console.log('\nLegacy USER.games overlay fields missing from USERGAME#:');
      for (const game of missingUserGameOverlays) {
        console.log(`  ${game.id} (${game.metaGame ?? 'unknown'}): ${summarizeOverlay(game)}`);
      }
    }
    if (overlayValueMismatches.length > 0) {
      console.log('\nDual-write overlay value mismatch (both stores set, values differ):');
      for (const row of overlayValueMismatches) {
        console.log(`  ${row.id} (${row.metaGame}): ${row.details}`);
      }
    }
    if (verbose && indexOnlyOverlays.length > 0) {
      console.log('\nUSERGAME# index-only overlays (expected after Phase 3 — not an error):');
      for (const row of indexOnlyOverlays) {
        const legacy = legacyById.get(row.sk);
        const metaGame = legacy?.metaGame ?? currentById.get(row.sk)?.metaGame ?? 'unknown';
        console.log(`  ${row.sk} (${metaGame}): ${summarizeOverlay(row)}`);
      }
    }
  }

  process.exit(indexHealthy ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
