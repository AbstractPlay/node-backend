#!/usr/bin/env node
/**
 * Backfill outcome snapshot attributes on settled LADDERGAME rows.
 *
 * Usage:
 *   npm run backfill-ladder-game-snapshots -- --stage dev --ladderId <uuid> --sinceDays 30
 *   npm run backfill-ladder-game-snapshots -- --stage prod --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { buildLadderOutcomeSnapshot, ladderGameRecordHasSnapshot, ladderGameSnapshotUpdateFragments } from '../lib/ladders/outcomeSnapshot.js';
import { computeLadderPointDeltas } from '../lib/ladders/delta.js';
import { computePaceMultiplier } from '../lib/ladders/paceMultiplier.js';
import { ladderGameSk } from '../lib/ladders/keys.js';
import { replayLadderPointsFromGames } from '../lib/ladders/replayMemberPoints.js';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function parseArgs(argv) {
  const args = {
    stage: 'dev',
    live: false,
    sinceDays: 30,
    ladderId: undefined,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--ladderId' && argv[i + 1]) {
      args.ladderId = argv[++i];
    } else if (arg === '--sinceDays' && argv[i + 1]) {
      args.sinceDays = Number(argv[++i]);
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--dry-run') {
      args.live = false;
    } else if (arg === '--help' || arg === '-h') {
      console.error(`Usage: npm run backfill-ladder-game-snapshots -- --stage dev|prod [--ladderId <id>] [--sinceDays 30] [--live]

Default is dry-run. Updates settled LADDERGAME rows missing snapshot attrs.
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

async function queryAll(client, tableName, pk, skPrefix) {
  const items = [];
  let lastKey;
  do {
    const input = {
      TableName: tableName,
      KeyConditionExpression: skPrefix
        ? '#pk = :pk AND begins_with(#sk, :sk)'
        : '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', ...(skPrefix ? { '#sk': 'sk' } : {}) },
      ExpressionAttributeValues: skPrefix
        ? { ':pk': pk, ':sk': skPrefix }
        : { ':pk': pk },
      ExclusiveStartKey: lastKey,
    };
    const result = await client.send(new QueryCommand(input));
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** In-progress games use `#0#`; completed (settled ladder) rows use `#1#`. */
async function loadGame(client, tableName, metaGame, gameId) {
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

function pointsAtSettlement(seeds, tuning, priorGames) {
  return replayLadderPointsFromGames(seeds, tuning, priorGames);
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const dryRun = !args.live;
  const cutoff = Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(JSON.stringify({
    tableName,
    mode: dryRun ? 'dry-run' : 'live',
    sinceDays: args.sinceDays,
    ladderId: args.ladderId ?? '(all)',
  }));

  const links = args.ladderId
    ? await queryAll(client, tableName, 'LADDERGAME', `${args.ladderId}#`)
    : await queryAll(client, tableName, 'LADDERGAME');
  const ladderIds = new Set(links.map((row) => row.ladderId).filter(Boolean));
  const ladderById = new Map();
  for (const ladderId of ladderIds) {
    const row = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'LADDER', sk: ladderId },
    }));
    if (row.Item) {
      ladderById.set(ladderId, row.Item);
    }
  }

  const candidates = links.filter((row) => {
    if (row.settled !== true) {
      return false;
    }
    const settledAt = Number(row.settledAt ?? 0);
    if (settledAt < cutoff) {
      return false;
    }
    return !ladderGameRecordHasSnapshot(row);
  });

  let updated = 0;
  for (const ladderId of ladderIds) {
    const ladder = ladderById.get(ladderId);
    if (!ladder) {
      continue;
    }
    const tuning = ladder.tuning;
    const metaGame = ladder.metaGame;
    const members = await queryAll(client, tableName, 'LADDERPLAYER', `${ladderId}#`);
    const ladderPlayerRecords = members.map((row) => ({
      pk: 'LADDERPLAYER',
      sk: row.sk,
      ladderId,
      userid: row.userid,
      points: Number(row.points ?? 0),
      membershipStatus: row.membershipStatus ?? 'active',
      joinedAt: Number(row.joinedAt ?? 0),
      lastLadderActivityAt: Number(row.lastLadderActivityAt ?? 0),
      activeLadderGameCount: Number(row.activeLadderGameCount ?? 0),
      startingPoints: Number(row.startingPoints ?? 0),
      startingPointsSource: row.startingPointsSource ?? 'initial_points_default',
      startingPointsRecordedAt: Number(row.startingPointsRecordedAt ?? 0),
      startingLadderStatus: row.startingLadderStatus ?? 'active',
    }));
    const seeds = new Map();
    for (const row of members) {
      if (typeof row.userid === 'string') {
        seeds.set(row.userid, Number(row.startingPoints ?? 0));
      }
    }

    const ladderLinks = links.filter((row) => row.ladderId === ladderId && row.settled === true);
    const replayGames = [];
    for (const link of ladderLinks) {
      const gameId = link.gameId ?? String(link.sk ?? '').split('#')[1];
      const game = await loadGame(client, tableName, metaGame, gameId);
      if (!game) {
        continue;
      }
      replayGames.push({
        gameId,
        settledAt: Number(link.settledAt ?? game.gameEnded ?? 0),
        winner: game.winner,
        players: (game.players ?? []).map((p) => ({ id: p.id, name: p.name })),
        gameStarted: game.gameStarted,
        gameEnded: game.gameEnded,
        numMoves: game.numMoves,
      });
    }
    replayGames.sort((a, b) => a.settledAt - b.settledAt);

    const ladderCandidates = candidates.filter((row) => row.ladderId === ladderId);
    for (const link of ladderCandidates) {
      const gameId = link.gameId ?? String(link.sk ?? '').split('#')[1];
      const settledAt = Number(link.settledAt ?? 0);
      const prior = replayGames.filter((g) => g.settledAt < settledAt);
      const pointMap = pointsAtSettlement(seeds, tuning, prior);

      const game = await loadGame(client, tableName, metaGame, gameId);
      if (!game) {
        console.warn(`skip ${ladderId}#${gameId}: missing GAME`);
        continue;
      }
      const players = game.players ?? [];
      if (players.length < 2) {
        console.warn(`skip ${ladderId}#${gameId}: need two players`);
        continue;
      }

      let winnerGain;
      let loserLoss;
      let winnerPointsBefore;
      let loserPointsBefore;
      const winner = game.winner;
      if (Array.isArray(winner) && winner.length === 1) {
        const winnerIndex = winner[0] - 1;
        const loserIndex = winnerIndex === 0 ? 1 : 0;
        const winnerId = players[winnerIndex]?.id;
        const loserId = players[loserIndex]?.id;
        const wBefore = pointMap.get(winnerId);
        const lBefore = pointMap.get(loserId);
        if (wBefore !== undefined && lBefore !== undefined) {
          const ended = game.gameEnded ?? settledAt;
          const started = game.gameStarted ?? ended;
          const pace = computePaceMultiplier(started, ended, game.numMoves ?? 0, tuning);
          const deltas = computeLadderPointDeltas(wBefore, lBefore, pace, tuning);
          winnerPointsBefore = wBefore;
          loserPointsBefore = lBefore;
          winnerGain = deltas.winnerGain;
          loserLoss = deltas.loserLoss;
        }
      }

      const ladderPlayersAtSettlement = ladderPlayerRecords.map((p) => ({
        ...p,
        points: pointMap.get(p.userid) ?? p.points,
      }));
      const snapshot = buildLadderOutcomeSnapshot({
        players: [
          { id: players[0].id, name: players[0].name },
          { id: players[1].id, name: players[1].name },
        ],
        winner: game.winner,
        metaGame,
        state: game.state,
        ladderPlayers: ladderPlayersAtSettlement,
        winnerPointsBefore,
        loserPointsBefore,
        winnerGain,
        loserLoss,
      });
      const fragments = ladderGameSnapshotUpdateFragments(snapshot);
      console.log(JSON.stringify({
        ladderId,
        gameId,
        settledAt,
        outcome: snapshot.outcome,
        dryRun,
      }));

      if (!dryRun && fragments.setClauses.length > 0) {
        await client.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk: 'LADDERGAME', sk: ladderGameSk(ladderId, gameId) },
          UpdateExpression: `SET ${fragments.setClauses.join(', ')}`,
          ExpressionAttributeNames: fragments.expressionAttributeNames,
          ExpressionAttributeValues: {
            ...fragments.expressionAttributeValues,
            ':t': true,
          },
          ConditionExpression: 'settled = :t',
        }));
      }
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    candidates: candidates.length,
    processed: updated,
    dryRun,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});