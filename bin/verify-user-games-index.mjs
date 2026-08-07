#!/usr/bin/env node
/* eslint-env node */
/**
 * Verify a user's dashboard game index readiness for Phase 3 cutover.
 *
 * Compares:
 *   - active games in USER.games[] (toMove set)
 *   - CURRENTGAMES#<userid> projected rows
 *   - USERGAME#<userid> overlay rows vs games with seen/lastChat in USER.games[]
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
  --verbose          Print per-game details for mismatches
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

function hasUserGameOverlay(game) {
  return game.seen !== undefined || game.lastChat !== undefined;
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

function summarizeOverlay(game) {
  const parts = [];
  if (game.seen !== undefined) {
    parts.push(`seen=${game.seen}`);
  }
  if (game.lastChat !== undefined) {
    parts.push(`lastChat=${game.lastChat}`);
  }
  return parts.join(', ');
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
  const overlayGames = games.filter(hasUserGameOverlay);

  const currentGames = await queryPartition(docClient, table, `CURRENTGAMES#${userId}`);
  const userGameRows = await queryPartition(docClient, table, `USERGAME#${userId}`);

  const activeIds = new Set(activeGames.map(g => g.id));
  const currentIds = new Set(currentGames.map(g => g.sk));
  const overlayIds = new Set(overlayGames.map(g => g.id));
  const userGameIds = new Set(userGameRows.map(g => g.sk));

  const missingFromCurrent = [...activeIds].filter(id => !currentIds.has(id));
  const extraInCurrent = [...currentIds].filter(id => !activeIds.has(id));
  const missingUserGame = [...overlayIds].filter(id => !userGameIds.has(id));
  const extraUserGame = [...userGameIds].filter(id => !overlayIds.has(id));

  const currentCountMatch = activeGames.length === currentGames.length;
  const currentIdsMatch = missingFromCurrent.length === 0 && extraInCurrent.length === 0;
  const userGameCountMatch = overlayGames.length === userGameRows.length;
  const userGameIdsMatch = missingUserGame.length === 0 && extraUserGame.length === 0;

  const phase3Ready = currentCountMatch && currentIdsMatch && userGameCountMatch && userGameIdsMatch;

  console.log(`User: ${userData.Item.name ?? userId}`);
  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log('');
  console.log('Counts:');
  console.log(`  USER.games total:              ${games.length}`);
  console.log(`  USER.games active (toMove set): ${activeGames.length}`);
  console.log(`  CURRENTGAMES# rows:            ${currentGames.length}`);
  console.log(`  USER.games with seen/lastChat: ${overlayGames.length}`);
  console.log(`  USERGAME# rows:                ${userGameRows.length}`);
  console.log('');
  console.log('Phase 3 readiness:');
  console.log(`  CURRENTGAMES count match: ${currentCountMatch ? 'yes' : 'NO'}`);
  console.log(`  CURRENTGAMES id match:    ${currentIdsMatch ? 'yes' : 'NO'}`);
  console.log(`  USERGAME count match:     ${userGameCountMatch ? 'yes' : 'NO'}`);
  console.log(`  USERGAME id match:        ${userGameIdsMatch ? 'yes' : 'NO'}`);
  console.log(`  READY FOR PHASE 3:        ${phase3Ready ? 'YES' : 'NO'}`);

  if (verbose || !phase3Ready) {
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
    if (missingUserGame.length > 0) {
      console.log('\nOverlay expected in USERGAME# but missing:');
      for (const id of missingUserGame) {
        const game = overlayGames.find(g => g.id === id);
        console.log(`  ${id} (${summarizeOverlay(game)})`);
      }
    }
    if (extraUserGame.length > 0) {
      console.log('\nUSERGAME# rows without overlay source in USER.games:');
      for (const id of extraUserGame) {
        const row = userGameRows.find(g => g.sk === id);
        const parts = [];
        if (row?.seen !== undefined) {
          parts.push(`seen=${row.seen}`);
        }
        if (row?.lastChat !== undefined) {
          parts.push(`lastChat=${row.lastChat}`);
        }
        console.log(`  ${id} (${parts.join(', ')})`);
      }
    }
  }

  process.exit(phase3Ready ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
