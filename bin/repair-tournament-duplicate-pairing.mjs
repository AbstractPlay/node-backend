#!/usr/bin/env node
/**
 * Remove a duplicate tournament pairing game and realign division counters + scores.
 *
 * Lie Low #21: duplicate BerretSO4/bael games — drop the short draw (8c12d499), keep 487cc429.
 *
 * Usage:
 *   npm run repair-tournament-duplicate-pairing -- --stage prod --tournament-id <uuid> --drop-game-id <uuid>
 *   npm run repair-tournament-duplicate-pairing -- --stage prod --tournament-id <uuid> --drop-game-id <uuid> --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev', live: false, tournamentId: '', dropGameId: '', division: '1' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--tournament-id' && argv[i + 1]) {
      args.tournamentId = argv[++i];
    } else if (arg === '--drop-game-id' && argv[i + 1]) {
      args.dropGameId = argv[++i];
    } else if (arg === '--division' && argv[i + 1]) {
      args.division = argv[++i];
    }
  }
  return args;
}

function scoreIncrement(winner, p1, p2) {
  if (!winner || winner.length === 0) {
    return { [p1]: 0, [p2]: 0 };
  }
  if (winner.length === 2) {
    return { [p1]: 0.5, [p2]: 0.5 };
  }
  const w = winner[0];
  return w === p1 ? { [p1]: 1, [p2]: 0 } : { [p1]: 0, [p2]: 1 };
}

async function loadTournamentGames(client, tableName, tournamentId, division) {
  const data = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'TOURNAMENTGAME',
      ':sk': `${tournamentId}#${division}#`,
    },
  }));
  return data.Items ?? [];
}

async function resolvePlayers(client, tableName, metaGame, gameRow) {
  let p1 = gameRow.player1;
  let p2 = gameRow.player2;
  if (p1 && p2) {
    return { p1, p2 };
  }
  const gid = gameRow.sk.split('#').pop();
  const completed = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: `${metaGame}#1#${gid}` },
  }));
  const players = completed.Item?.players ?? [];
  return { p1: players[0]?.id, p2: players[1]?.id };
}

async function main() {
  const { stage, live, tournamentId, dropGameId, division } = parseArgs(process.argv);
  if (!tournamentId || !dropGameId) {
    console.error('Required: --tournament-id and --drop-game-id');
    process.exit(1);
  }

  const tableName = tableNameForStage(stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const tournament = (await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENT', sk: tournamentId },
  }))).Item;
  if (!tournament) {
    console.error('Tournament not found');
    process.exit(1);
  }
  if (tournament.dateEnded !== undefined) {
    console.error('Tournament already ended; aborting');
    process.exit(1);
  }

  const metaGame = tournament.metaGame;
  const div = tournament.divisions?.[division];
  if (!div) {
    console.error(`Division ${division} missing on tournament`);
    process.exit(1);
  }

  const tournamentGames = await loadTournamentGames(client, tableName, tournamentId, division);
  const dropRow = tournamentGames.find((g) => g.sk.endsWith(`#${dropGameId}`));
  if (!dropRow) {
    console.error(`drop-game-id ${dropGameId} not found under tournament`);
    process.exit(1);
  }

  const remaining = tournamentGames.filter((g) => !g.sk.endsWith(`#${dropGameId}`));
  const playersData = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'TOURNAMENTPLAYER',
      ':sk': `${tournamentId}#${division}#`,
    },
  }));
  const tournamentPlayers = playersData.Items ?? [];

  const recalcScores = new Map();
  for (const p of tournamentPlayers) {
    recalcScores.set(p.playerid, 0);
  }

  for (const g of remaining) {
    const { p1, p2 } = await resolvePlayers(client, tableName, metaGame, g);
    if (!p1 || !p2) {
      console.error(`Could not resolve players for ${g.sk}`);
      process.exit(1);
    }
    const inc = scoreIncrement(g.winner, p1, p2);
    recalcScores.set(p1, (recalcScores.get(p1) ?? 0) + (inc[p1] ?? 0));
    recalcScores.set(p2, (recalcScores.get(p2) ?? 0) + (inc[p2] ?? 0));
  }

  const scoreUpdates = [];
  for (const p of tournamentPlayers) {
    const next = recalcScores.get(p.playerid) ?? 0;
    const current = p.score ?? 0;
    if (next !== current) {
      scoreUpdates.push({
        playerid: p.playerid,
        playername: p.playername,
        current,
        next,
      });
    }
  }

  const newNumCompleted = remaining.filter((g) => g.winner !== undefined && g.winner !== null).length;

  console.log(JSON.stringify({
    tableName,
    mode: live ? 'LIVE' : 'dry-run',
    tournamentId,
    metaGame,
    number: tournament.number,
    division,
    dropGameId,
    tournamentGamesBefore: tournamentGames.length,
    tournamentGamesAfter: remaining.length,
    numGames: div.numGames,
    numCompletedBefore: div.numCompleted,
    numCompletedAfter: newNumCompleted,
    processed: div.processed,
    scoreUpdates,
  }, null, 2));

  if (!live) {
    console.log('\nRe-run with --live to apply.');
    return;
  }

  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENTGAME', sk: dropRow.sk },
  }));

  for (const g of remaining) {
    if (g.player1 && g.player2) {
      continue;
    }
    const gid = g.sk.split('#').pop();
    const { p1, p2 } = await resolvePlayers(client, tableName, metaGame, g);
    if (!p1 || !p2) {
      continue;
    }
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'TOURNAMENTGAME', sk: g.sk },
      UpdateExpression: 'set player1 = :p1, player2 = :p2, id = :id',
      ExpressionAttributeValues: { ':p1': p1, ':p2': p2, ':id': gid },
    }));
  }

  for (const skSuffix of [`${metaGame}#0#${dropGameId}`, `${metaGame}#1#${dropGameId}`]) {
    try {
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'GAME', sk: skSuffix },
        UpdateExpression: 'REMOVE tournament, division',
        ConditionExpression: 'attribute_exists(pk)',
      }));
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') {
        throw err;
      }
    }
  }

  for (const u of scoreUpdates) {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: {
        pk: 'TOURNAMENTPLAYER',
        sk: `${tournamentId}#${division}#${u.playerid}`,
      },
      ExpressionAttributeValues: { ':s': u.next },
      UpdateExpression: 'set score = :s',
    }));
  }

  const updatedDivisions = {
    ...tournament.divisions,
    [division]: {
      ...div,
      numCompleted: newNumCompleted,
      processed: false,
    },
  };

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENT', sk: tournamentId },
    ExpressionAttributeValues: { ':d': updatedDivisions },
    UpdateExpression: 'set divisions = :d',
  }));

  console.log('Repair applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
