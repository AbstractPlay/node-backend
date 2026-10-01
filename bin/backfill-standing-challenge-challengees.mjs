#!/usr/bin/env node
/* eslint-env node */
/**
 * One-time repair for legacy standing-challenge `challengees` corruption
 * (challenger / seated players incorrectly listed as invitees).
 *
 * Usage:
 *   npx tsx bin/backfill-standing-challenge-challengees.mjs --stage dev --dry-run
 *   npx tsx bin/backfill-standing-challenge-challengees.mjs --stage prod --apply
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import {
  legacyChallengeSeatsNeedRepair,
  repairLegacyChallengeSeats,
} from '../lib/challenges/seatAccounting.ts';

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
  console.error(`Usage: npx tsx bin/backfill-standing-challenge-challengees.mjs --stage dev|prod [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --dry-run          Print planned changes without writing (default)
  --apply            Apply updates to DynamoDB
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      apply = false;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { stage, apply };
}

async function queryStandingChallenges(docClient, tableName, metaGame) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `STANDINGCHALLENGE#${metaGame}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

function metaGameUids() {
  const metaGames = [];
  gameinfo.forEach(g => metaGames.push(g.uid));
  return metaGames;
}

async function main() {
  const { stage, apply } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }), {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);

  let scanned = 0;
  let needsRepair = 0;
  let repaired = 0;

  for (const metaGame of metaGameUids()) {
    const items = await queryStandingChallenges(docClient, table, metaGame);
    for (const item of items) {
      if (item.fillableDirect === true) {
        continue;
      }
      scanned += 1;
      const seatChallenge = {
        numPlayers: item.numPlayers,
        standing: item.standing,
        challenger: item.challenger,
        players: item.players,
        challengees: item.challengees,
        openSlots: item.openSlots,
      };
      if (!legacyChallengeSeatsNeedRepair(seatChallenge, { storageStanding: true })) {
        continue;
      }
      needsRepair += 1;
      const repairedItem = repairLegacyChallengeSeats(
        { ...item, ...seatChallenge },
        { storageStanding: true },
      );
      const challengeId = String(item.id ?? item.sk);
      console.log(
        `REPAIR ${metaGame}#${challengeId} challengees: ${
          JSON.stringify((item.challengees ?? []).map(c => c.id))
        } -> []`,
      );

      if (apply) {
        await docClient.send(new PutCommand({
          TableName: table,
          Item: {
            ...item,
            challengees: repairedItem.challengees ?? [],
            pk: item.pk,
            sk: item.sk,
          },
        }));
        repaired += 1;
      }
    }
  }

  console.log(`Scanned ${scanned} standing challenge rows; ${needsRepair} need repair; ${repaired} written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
