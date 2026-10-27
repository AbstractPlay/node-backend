#!/usr/bin/env node
/**
 * Replay ladder point deltas from join seeds + settled games; compare to live LADDERPLAYER.points.
 * Inactivity decay is not replayed — expect drift when decay has applied.
 *
 * Usage:
 *   ABSTRACT_PLAY_TABLE=abstract-play-dev npm run replay-ladder-member -- <ladderId> <userid>
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { replayLadderPointsFromGames } from '../lib/ladders/replayMemberPoints.ts';

const ladderId = process.argv[2];
const userid = process.argv[3];

if (!ladderId || !userid) {
  console.error('Usage: replay-ladder-member.mjs <ladderId> <userid>');
  process.exit(1);
}

const tableName = process.env.ABSTRACT_PLAY_TABLE;
if (!tableName) {
  console.error('ABSTRACT_PLAY_TABLE is required');
  process.exit(1);
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function queryAll(pk, skPrefix) {
  const items = [];
  let lastKey;
  const values = { ':pk': pk };
  const names = { '#pk': 'pk' };
  let condition = '#pk = :pk';
  if (skPrefix !== undefined) {
    values[':sk'] = skPrefix;
    names['#sk'] = 'sk';
    condition += ' and begins_with(#sk, :sk)';
  }
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: condition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function loadGame(metaGame, gameId) {
  const active = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: `${metaGame}#0#${gameId}` },
  }));
  if (active.Item) {
    return active.Item;
  }
  const completed = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: `${metaGame}#1#${gameId}` },
  }));
  return completed.Item;
}

async function main() {
  const ladderRow = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'LADDER', sk: ladderId },
  }));
  const ladder = ladderRow.Item;
  if (!ladder) {
    console.error(`Ladder ${ladderId} not found`);
    process.exit(1);
  }

  const playerRow = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'LADDERPLAYER', sk: `${ladderId}#${userid}` },
  }));
  const player = playerRow.Item;
  if (!player) {
    console.error(`LADDERPLAYER ${ladderId}#${userid} not found`);
    process.exit(1);
  }

  const members = await queryAll('LADDERPLAYER', `${ladderId}#`);
  const seeds = new Map();
  for (const row of members) {
    if (typeof row.userid !== 'string') {
      continue;
    }
    const seed = Number(row.startingPoints);
    if (Number.isFinite(seed)) {
      seeds.set(row.userid, seed);
    }
  }

  const links = await queryAll('LADDERGAME', `${ladderId}#`);
  const settledLinks = links.filter((row) => row.settled === true);
  const replayGames = [];
  for (const link of settledLinks) {
    const gameId = link.gameId ?? String(link.sk ?? '').split('#')[1];
    if (typeof gameId !== 'string' || gameId.length === 0) {
      continue;
    }
    const game = await loadGame(ladder.metaGame, gameId);
    if (!game) {
      continue;
    }
    replayGames.push({
      gameId,
      settledAt: Number(link.settledAt ?? game.gameEnded ?? 0),
      winner: game.winner,
      players: (game.players ?? []).map((p) => ({ id: p.id })),
      gameStarted: game.gameStarted,
      gameEnded: game.gameEnded,
      numMoves: game.numMoves,
    });
  }

  const replayed = replayLadderPointsFromGames(seeds, ladder.tuning, replayGames);
  const expected = replayed.get(userid);
  const live = Number(player.points);

  const report = {
    tableName,
    ladderId,
    userid,
    livePoints: live,
    replayedPointsNoDecay: expected,
    match: expected === live,
    settledGamesReplayed: replayGames.length,
    lastDecayAt: player.lastDecayAt,
    note: player.lastDecayAt
      ? 'Decay is not included in replay; mismatch may be expected after ladder-decay.'
      : undefined,
  };
  console.log(JSON.stringify(report, null, 2));
  if (expected !== undefined && expected !== live) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
