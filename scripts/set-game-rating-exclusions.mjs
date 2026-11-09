#!/usr/bin/env node
/* eslint-env node */
/**
 * Set players[].skipRating on completed GAME rows (asymmetric rating opt-out).
 *
 * Usage:
 *   npm run set-game-rating-exclusions -- --stage prod --from-csv vacation-stop-clock-incidents.csv --dry-run
 *   npm run set-game-rating-exclusions -- --stage prod --from-csv vacation-stop-clock-incidents.csv --apply
 *   npm run set-game-rating-exclusions -- --stage prod --meta-game tafl --game-id <uuid> --user-id <uuid> --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { setGameRatingExclusions } from '../lib/games/gameRatingExclusion.ts';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function usage() {
  console.error(`Usage: npx tsx scripts/set-game-rating-exclusions.mjs [options]

Options:
  --stage dev|prod
  --from-csv <path>       Rows use gameId, metaGame, loserId
  --loser-id <uuid>       With --from-csv, only this victim
  --meta-game <name>      Single game
  --game-id <uuid>
  --user-id <uuid>        Repeatable; default: loserId from CSV row
  --clear                 Remove skipRating for listed users
  --dry-run               Assess only (default)
  --apply                 Write GAME row
  --help, -h
`);
  process.exit(1);
}

function parseCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    return {
      gameId: c[col('gameId')],
      metaGame: c[col('metaGame')],
      loserId: c[col('loserId')],
      loserName: col('loserName') >= 0 ? c[col('loserName')] : '',
    };
  });
}

async function main() {
  let stage = 'dev';
  let csvArg;
  let loserIdFilter;
  let metaGame;
  let gameId;
  let userIds = [];
  let apply = false;
  let clear = false;

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--stage' && process.argv[i + 1]) stage = process.argv[++i];
    else if (arg === '--from-csv' && process.argv[i + 1]) csvArg = process.argv[++i];
    else if (arg === '--loser-id' && process.argv[i + 1]) loserIdFilter = process.argv[++i];
    else if (arg === '--meta-game' && process.argv[i + 1]) metaGame = process.argv[++i];
    else if (arg === '--game-id' && process.argv[i + 1]) gameId = process.argv[++i];
    else if (arg === '--user-id' && process.argv[i + 1]) userIds.push(process.argv[++i]);
    else if (arg === '--clear') clear = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg === '--apply') apply = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const stageCfg = STAGES[stage];
  if (!stageCfg) {
    console.error(`Unknown stage: ${stage}`);
    process.exit(1);
  }

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile: stageCfg.profile,
  }));

  const specs = [];
  if (csvArg) {
    const csvPath = path.isAbsolute(csvArg) ? csvArg : path.join(root, csvArg);
    for (const row of parseCsv(csvPath)) {
      if (loserIdFilter && row.loserId !== loserIdFilter) continue;
      if (gameId && row.gameId !== gameId) continue;
      specs.push({
        metaGame: row.metaGame,
        gameId: row.gameId,
        userIds: [row.loserId],
        label: row.loserName,
      });
    }
  } else if (metaGame && gameId && userIds.length > 0) {
    specs.push({ metaGame, gameId, userIds, label: '' });
  } else {
    console.error('Provide --from-csv or --meta-game + --game-id + --user-id');
    usage();
  }

  if (specs.length === 0) {
    console.error('No rows matched');
    process.exit(1);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let missingCompleted = 0;

  for (const spec of specs) {
    if (!apply) {
      const outcome = await setGameRatingExclusions(
        doc,
        stageCfg.table,
        spec.metaGame,
        spec.gameId,
        spec.userIds,
        { clear, dryRun: true },
      );
      if (!outcome.ok) {
        if (outcome.reason.startsWith('No completed game')) {
          console.log(`SKIP ${spec.metaGame} ${spec.gameId}: no #1# row (reopened or missing)`);
          missingCompleted += 1;
        } else {
          console.log(`FAIL ${spec.metaGame} ${spec.gameId}: ${outcome.reason}`);
          fail += 1;
        }
        continue;
      }
      console.log(`DRY-RUN ${spec.metaGame} ${spec.gameId} ${spec.label} -> skipRating for ${spec.userIds.join(',')}`);
      ok += 1;
      continue;
    }

    const outcome = await setGameRatingExclusions(
      doc,
      stageCfg.table,
      spec.metaGame,
      spec.gameId,
      spec.userIds,
      { clear },
    );
    if (!outcome.ok) {
      if (outcome.reason.startsWith('No completed game')) {
        console.log(`SKIP ${spec.metaGame} ${spec.gameId}: no #1# row`);
        missingCompleted += 1;
      } else {
        console.log(`FAIL ${spec.metaGame} ${spec.gameId}: ${outcome.reason}`);
        fail += 1;
      }
      continue;
    }
    if (outcome.changedUserIds.length === 0) {
      console.log(`SKIP ${spec.metaGame} ${spec.gameId} (already set)`);
      skip += 1;
    } else {
      console.log(`APPLY ${spec.metaGame} ${spec.gameId} changed=${outcome.changedUserIds.join(',')}`);
      ok += 1;
    }
  }

  console.log(`\nDone (${stage}): ok=${ok} skip=${skip} missing_1=${missingCompleted} fail=${fail}`);
  process.exit(fail > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
