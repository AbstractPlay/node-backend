#!/usr/bin/env node
/**
 * Finalize tournaments stuck with all games done but divisions.processed === false
 * (typically after the last game ended via timeloss before the shared endTournament hook).
 *
 * Usage:
 *   npm run unblock-stuck-tournaments -- --stage prod
 *   npm run unblock-stuck-tournaments -- --stage prod --live
 *   npm run unblock-stuck-tournaments -- --stage prod --live --id <tournament-uuid>
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { endTournament } from '../lib/tournaments/authHandlers.js';
import { divisionReadyForFinalization } from '../lib/games/tournamentGameEndUpdates.js';

/** Verified 2026-10-24 — all games finished, division unprocessed, no dateEnded. */
const DEFAULT_STUCK_IDS = [
  '2d85992c-461d-42cc-8619-731ee7b376c9',
  'b820c958-3dc5-49ee-80dd-eff42e7afdb0',
  'c785b8e6-5765-4a9d-aafa-180b7819953f',
  'f9b0af61-4c4d-4031-b195-ff11331f8d9d',
  '603710f9-4a20-4d00-8015-a9128a29d9b5',
  '4265619b-ad23-45b4-bfe6-78a13226e547',
  'daefa501-51dc-4645-a4b9-e9a8ab5de99a',
  'bfe0cb46-c582-47c1-af03-bb2ea3d6a267',
  '3a97205d-ca97-4c87-b0d6-4e8df5ccb58f',
  'c03a5127-ca20-493c-9ea2-c95fd0425d3f',
  'd6542517-8884-4bd4-a0c6-7d8a8f136881',
  '73aa6a07-b764-4b5f-b2ef-0883c52a71ea',
  '9c0e2c19-9997-4d51-916c-3462aaaf56d7',
  'fe2cbc9b-0e6c-4a9b-8429-1f79c9747e67',
];

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev', live: false, ids: DEFAULT_STUCK_IDS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--id' && argv[i + 1]) {
      args.ids = [argv[++i]];
    }
  }
  return args;
}

async function loadTournament(client, tableName, id) {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENT', sk: id },
  }));
  return data.Item;
}

async function main() {
  const { stage, live, ids } = parseArgs(process.argv);
  const tableName = tableNameForStage(stage);
  process.env.ABSTRACT_PLAY_TABLE = tableName;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  console.log(`Table: ${tableName}`);
  console.log(`Mode: ${live ? 'LIVE (will call endTournament)' : 'dry-run'}`);
  console.log(`Tournaments: ${ids.length}`);

  for (const id of ids) {
    const row = await loadTournament(client, tableName, id);
    if (row === undefined) {
      console.log(`[skip] ${id}: no TOURNAMENT row`);
      continue;
    }
    const meta = `${row.metaGame} #${row.number}`;
    if (row.dateEnded !== undefined) {
      console.log(`[skip] ${id} (${meta}): already dateEnded=${row.dateEnded}`);
      continue;
    }
    if (!divisionReadyForFinalization(row)) {
      console.log(`[skip] ${id} (${meta}): division not ready for finalization`, row.divisions);
      continue;
    }
    if (!live) {
      console.log(`[dry-run] would endTournament ${id} (${meta})`);
      continue;
    }
    console.log(`[live] endTournament ${id} (${meta})...`);
    const result = await endTournament(row);
    const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    console.log(`[done] ${id}: status ${result.statusCode} ${body.slice(0, 200)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
