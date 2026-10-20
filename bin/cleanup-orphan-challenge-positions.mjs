#!/usr/bin/env node
/**
 * Dry-run by default: list CHALLENGEPOSITION rows with no CHALLENGE or STANDINGCHALLENGE parent.
 * Pass --execute to delete orphans.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const table = process.env.ABSTRACT_PLAY_TABLE;
if (!table) {
  console.error('Set ABSTRACT_PLAY_TABLE');
  process.exit(1);
}
const execute = process.argv.includes('--execute');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const positionIds = [];
let lastKey;
do {
  const result = await client.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'CHALLENGEPOSITION' },
      ProjectionExpression: 'sk',
      ExclusiveStartKey: lastKey,
    }),
  );
  for (const item of result.Items ?? []) {
    if (typeof item.sk === 'string') {
      positionIds.push(item.sk);
    }
  }
  lastKey = result.LastEvaluatedKey;
} while (lastKey);

if (positionIds.length === 0) {
  console.log('No CHALLENGEPOSITION rows.');
  process.exit(0);
}

const metaGames = [];
gameinfo.forEach((g) => metaGames.push(g.uid));

async function parentExists(challengeId) {
  const direct = await client.send(
    new GetCommand({
      TableName: table,
      Key: { pk: 'CHALLENGE', sk: challengeId },
    }),
  );
  if (direct.Item) {
    return true;
  }
  for (const metaGame of metaGames) {
    const standing = await client.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `STANDINGCHALLENGE#${metaGame}`, sk: challengeId },
      }),
    );
    if (standing.Item) {
      return true;
    }
  }
  return false;
}

const confirmedOrphans = [];
for (const id of positionIds) {
  if (!(await parentExists(id))) {
    confirmedOrphans.push(id);
  }
}

console.log(`CHALLENGEPOSITION rows: ${positionIds.length}, orphans: ${confirmedOrphans.length}`);
for (const id of confirmedOrphans) {
  console.log(`  orphan ${id}`);
}

if (!execute) {
  if (confirmedOrphans.length > 0) {
    console.error('\nDry run. Add --execute to delete listed orphans.');
  }
  process.exit(0);
}

for (const id of confirmedOrphans) {
  await client.send(
    new DeleteCommand({
      TableName: table,
      Key: { pk: 'CHALLENGEPOSITION', sk: id },
    }),
  );
  console.log(`Deleted CHALLENGEPOSITION ${id}`);
}
