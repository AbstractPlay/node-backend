#!/usr/bin/env node
/* eslint-env node */
/**
 * Enrich vacation-stop-clock-incidents.csv with GAME linkage flags (prod GetItem).
 *
 * Usage:
 *   npx tsx scripts/classify-vacation-incident-games.mjs --stage prod --csv vacation-stop-clock-incidents.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function parseCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    return {
      gameId: c[col('gameId')],
      metaGame: c[col('metaGame')],
      loserName: c[col('loserName')],
      loserId: c[col('loserId')],
    };
  });
}

function salvageTier(game) {
  if (!game) return 'missing';
  if (game.playMode === 'arena') return 'arena_skip';
  if (game.tournament) return 'tournament';
  if (game.ladderId) return 'ladder';
  if (game.event) return 'event';
  if (game.rated === true) return 'rated_casual';
  return 'casual';
}

function tierLabel(tier) {
  const map = {
    casual: 'A — casual reopen (low hook risk)',
    rated_casual: 'B — rated casual (Elo may need reversal)',
    ladder: 'C — ladder (points + indexes)',
    tournament: 'D — tournament (bracket/pairing)',
    event: 'E — organized event',
    missing: 'Z — GAME row missing',
    arena_skip: 'skip — arena',
  };
  return map[tier] ?? tier;
}

async function main() {
  let stage = 'prod';
  let csvArg = 'vacation-stop-clock-incidents.csv';
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--stage' && process.argv[i + 1]) stage = process.argv[++i];
    else if (process.argv[i] === '--csv' && process.argv[i + 1]) csvArg = process.argv[++i];
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rows = parseCsv(path.isAbsolute(csvArg) ? csvArg : path.join(root, csvArg));
  const { profile, table } = STAGES[stage];
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1', profile }));

  const enriched = [];
  for (const row of rows) {
    const sk = `${row.metaGame}#1#${row.gameId}`;
    const res = await doc.send(new GetCommand({
      TableName: table,
      Key: { pk: 'GAME', sk },
      ProjectionExpression: [
        'id',
        'metaGame',
        'tournament',
        'ladderId',
        'event',
        'rated',
        'playMode',
        'division',
        'matchLeg',
        'numMoves',
        'winner',
        'players',
      ].join(', '),
    }));
    const g = res.Item ?? null;
    const tier = salvageTier(g);
    const opponents = g?.players
      ?.filter(p => p.id !== row.loserId)
      .map(p => p.name || p.id.slice(0, 8))
      .join('; ') ?? '';
    enriched.push({
      ...row,
      tier,
      tournament: g?.tournament,
      ladderId: g?.ladderId,
      event: g?.event,
      rated: g?.rated,
      numMoves: g?.numMoves,
      winnerSeat: g?.winner?.[0],
      opponent: opponents,
    });
  }

  const byTier = new Map();
  const byVictim = new Map();
  const byMeta = new Map();
  for (const e of enriched) {
    byTier.set(e.tier, (byTier.get(e.tier) ?? 0) + 1);
    const vk = e.loserName;
    byVictim.set(vk, (byVictim.get(vk) ?? 0) + 1);
    byMeta.set(e.metaGame, (byMeta.get(e.metaGame) ?? 0) + 1);
  }

  console.log(`\n=== Salvage tiers (${enriched.length} games) ===\n`);
  for (const [tier, count] of [...byTier.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${count}\t${tierLabel(tier)}`);
  }

  console.log(`\n=== By victim ===\n`);
  for (const [name, count] of byVictim) console.log(`${count}\t${name}`);

  console.log(`\n=== By metaGame ===\n`);
  for (const [mg, count] of [...byMeta.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${count}\t${mg}`);
  }

  console.log(`\n=== Detail (tier | meta | moves | hooks | victim vs opponent | gameId) ===\n`);
  for (const e of enriched.sort((a, b) => a.tier.localeCompare(b.tier) || a.metaGame.localeCompare(b.metaGame))) {
    const hooks = [
      e.rated === true ? 'rated' : null,
      e.tournament ? `tourn:${e.tournament.slice(0, 8)}` : null,
      e.ladderId ? `ladder:${e.ladderId.slice(0, 8)}` : null,
      e.event ? `event:${e.event.slice(0, 8)}` : null,
    ].filter(Boolean).join(', ') || 'none';
    console.log(
      `${e.tier}\t${e.metaGame}\tmoves=${e.numMoves ?? '?'}\t${hooks}\t`
      + `${e.loserName} vs ${e.opponent}\t${e.gameId}`,
    );
  }
}

await main();
