#!/usr/bin/env node
/**
 * Verify computeDivisionStandings against completed tournaments in DynamoDB.
 *
 * Usage:
 *   npm run verify-division-standings -- --stage prod
 *   npm run verify-division-standings -- --stage prod --limit 25 --write-fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { computeDivisionStandings } from '../lib/tournaments/divisionStandings.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(repoRoot, 'test/fixtures/tournaments');

function parseArgs(argv) {
  const args = { stage: 'prod', limit: 25, writeFixtures: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (arg === '--write-fixtures') {
      args.writeFixtures = true;
    }
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

async function queryAll(client, tableName, pk, skPrefix) {
  const items = [];
  let lastKey;
  const values = { ':pk': pk };
  let condition = '#pk = :pk';
  const names = { '#pk': 'pk' };
  if (skPrefix !== undefined) {
    values[':sk'] = skPrefix;
    names['#sk'] = 'sk';
    condition += ' and begins_with(#sk, :sk)';
  }
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: condition,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function divisionNumberFromPlayerSk(sk) {
  const parts = String(sk).split('#');
  if (parts.length >= 2) {
    const n = Number(parts[1]);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return undefined;
}

function playersForDivision(tournament, divisionKey, tournamentId, divisionPlayersByPrefix) {
  const divisionNum = Number(divisionKey);
  if (tournament.players?.length) {
    return tournament.players.filter((pl) => {
      if (pl.division !== undefined) {
        return pl.division === divisionNum;
      }
      return divisionNumberFromPlayerSk(pl.sk) === divisionNum;
    });
  }
  const prefix = `${tournamentId}#${divisionKey}#`;
  return divisionPlayersByPrefix.get(prefix) ?? [];
}

function sanitizeFixtureName(tournamentId, divisionKey) {
  return `${tournamentId}-d${divisionKey}.json`;
}

async function loadTournamentCandidates(client, tableName) {
  const active = await queryAll(client, tableName, 'TOURNAMENT');
  const archived = await queryAll(client, tableName, 'COMPLETEDTOURNAMENT');
  const merged = [];
  for (const item of active) {
    if (item.dateEnded !== undefined && item.divisions) {
      merged.push({ ...item, archived: false });
    }
  }
  for (const item of archived) {
    if (item.dateEnded !== undefined && item.divisions) {
      merged.push({ ...item, archived: true });
    }
  }
  merged.sort((a, b) => (b.dateEnded ?? 0) - (a.dateEnded ?? 0));
  return merged;
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const tournaments = await loadTournamentCandidates(client, tableName);

  const allPlayers = await queryAll(client, tableName, 'TOURNAMENTPLAYER');
  const playersByPrefix = new Map();
  for (const row of allPlayers) {
    const sk = String(row.sk);
    const hash = sk.indexOf('#');
    if (hash === -1) {
      continue;
    }
    const second = sk.indexOf('#', hash + 1);
    if (second === -1) {
      continue;
    }
    const prefix = sk.slice(0, second + 1);
    const list = playersByPrefix.get(prefix) ?? [];
    list.push(row);
    playersByPrefix.set(prefix, list);
  }

  let checkedDivisions = 0;
  let mismatches = 0;
  const fixturesWritten = [];

  for (const tournament of tournaments) {
    if (checkedDivisions >= args.limit) {
      break;
    }
    const tournamentId = tournament.id ?? tournament.sk;
    if (!tournamentId || !tournament.divisions) {
      continue;
    }

    for (const [divisionKey, division] of Object.entries(tournament.divisions)) {
      if (checkedDivisions >= args.limit) {
        break;
      }
      if (!division.processed || division.winnerid === undefined) {
        continue;
      }

      const gamesRaw = await queryAll(
        client,
        tableName,
        'TOURNAMENTGAME',
        `${tournamentId}#${divisionKey}#`,
      );
      const playersRaw = playersForDivision(
        tournament,
        divisionKey,
        tournamentId,
        playersByPrefix,
      );

      if (gamesRaw.length === 0 || playersRaw.length === 0) {
        console.warn(`Skip ${tournamentId} div ${divisionKey}: missing games or players`);
        continue;
      }

      const playerIds = new Set(playersRaw.map((pl) => pl.playerid));
      const games = gamesRaw.map((game) => ({
        player1: game.player1,
        player2: game.player2,
        winner: game.winner,
      }));
      const orphanGame = games.find(
        (game) => !playerIds.has(game.player1) || !playerIds.has(game.player2),
      );
      if (orphanGame !== undefined) {
        console.warn(
          `Skip ${tournamentId} div ${divisionKey}: game references player outside division roster`,
        );
        continue;
      }

      const players = playersRaw.map((pl) => ({
        playerid: pl.playerid,
        playername: pl.playername,
        rating: pl.rating,
      }));

      const result = computeDivisionStandings(games, players);
      const tiebreakByPlayerId = Object.fromEntries(
        result.ranked.map((row) => [row.playerid, row.tiebreak]),
      );

      let ok = true;
      if (result.winnerId !== division.winnerid) {
        ok = false;
        console.error(
          `MISMATCH winnerId ${tournamentId}#${divisionKey}: expected ${division.winnerid}, got ${result.winnerId}`,
        );
      }
      if (result.winnerName !== division.winner) {
        ok = false;
        console.error(
          `MISMATCH winnerName ${tournamentId}#${divisionKey}: expected ${division.winner}, got ${result.winnerName}`,
        );
      }
      for (const pl of playersRaw) {
        const expectedTb = pl.tiebreak;
        if (expectedTb === undefined) {
          continue;
        }
        const computed = tiebreakByPlayerId[pl.playerid];
        if (computed !== expectedTb) {
          ok = false;
          console.error(
            `MISMATCH tiebreak ${tournamentId}#${divisionKey} ${pl.playerid}: expected ${expectedTb}, got ${computed}`,
          );
        }
      }

      if (!ok) {
        mismatches += 1;
      } else {
        console.log(`OK ${tournament.metaGame} ${tournamentId} division ${divisionKey} (${players.length} players)`);
        if (args.writeFixtures) {
          const fixture = {
            tournamentId,
            metaGame: tournament.metaGame,
            division: Number(divisionKey),
            games,
            players,
            expected: {
              winnerId: division.winnerid,
              winnerName: division.winner,
              tiebreakByPlayerId,
            },
          };
          mkdirSync(fixturesDir, { recursive: true });
          const name = sanitizeFixtureName(tournamentId, divisionKey);
          writeFileSync(join(fixturesDir, name), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
          fixturesWritten.push(name);
        }
      }
      checkedDivisions += 1;
    }
  }

  console.log(`Checked ${checkedDivisions} division(s); mismatches: ${mismatches}`);
  if (fixturesWritten.length > 0) {
    console.log(`Wrote fixtures: ${fixturesWritten.join(', ')}`);
  }
  if (checkedDivisions === 0) {
    console.error('No processed divisions found to verify.');
    process.exit(1);
  }
  if (mismatches > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
