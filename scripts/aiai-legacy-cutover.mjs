#!/usr/bin/env node
/**
 * Phase 6 — audit and clear legacy embedded AiAi user (prod/dev).
 *
 *   npx tsx scripts/aiai-legacy-cutover.mjs --stage prod           # audit only
 *   npx tsx scripts/aiai-legacy-cutover.mjs --stage prod --execute # decline + resign
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getChallengesByIds } from '../lib/challenges.js';
import { isActiveDashboardGame } from '../lib/dashboardGames.js';

const LEGACY = 'SkQfHAjeDxs8eeEnScuYA';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
    wsSqs: 'https://sqs.us-east-1.amazonaws.com/153672715141/abstractplay-ws-messages-dev',
    botOutboundQueue: 'https://sqs.us-east-1.amazonaws.com/153672715141/abstract-play-dev-bot-outbound',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
    wsSqs: 'https://sqs.us-east-1.amazonaws.com/153672715141/abstractplay-ws-messages-prod',
    botOutboundQueue: 'https://sqs.us-east-1.amazonaws.com/153672715141/abstract-play-prod-bot-outbound',
  },
};

function applyStageEnv(stageConfig) {
  process.env.ABSTRACT_PLAY_TABLE = stageConfig.table;
  process.env.WEBSOCKET_SQS = stageConfig.wsSqs;
  process.env.BOT_OUTBOUND_QUEUE_URL = stageConfig.botOutboundQueue;
}

function parseArgs(argv) {
  let stage = 'prod';
  let execute = false;
  let resignOnly = false;
  let challengesOnly = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (argv[i] === '--execute') {
      execute = true;
    } else if (argv[i] === '--resign-only') {
      resignOnly = true;
      execute = true;
    } else if (argv[i] === '--challenges-only') {
      challengesOnly = true;
      execute = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error('Usage: npx tsx scripts/aiai-legacy-cutover.mjs [--stage dev|prod] [--execute]');
      process.exit(0);
    }
  }
  if (!STAGES[stage]) {
    throw new Error(`Unknown stage: ${stage}`);
  }
  return { stage, execute, resignOnly, challengesOnly };
}

function toIdArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (value instanceof Set) {
    return [...value];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

async function main() {
  const { stage, execute, resignOnly, challengesOnly } = parseArgs(process.argv);
  const stageConfig = STAGES[stage];
  const { profile, table } = stageConfig;
  applyStageEnv(stageConfig);

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: 'us-east-1', profile }),
    { marshallOptions: { removeUndefinedValues: true } },
  );

  const current = await client.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `CURRENTGAMES#${LEGACY}` },
  }));

  const user = await client.send(new GetCommand({
    TableName: table,
    Key: { pk: 'USER', sk: LEGACY },
  }));
  if (!user.Item) {
    throw new Error(`No USER ${LEGACY} on ${table}`);
  }

  const receivedIds = toIdArray(user.Item.challenges_received);
  const challenges = await getChallengesByIds(client, table, receivedIds);
  const activeGames = (current.Items ?? []).filter((row) => isActiveDashboardGame(row));

  const report = {
    stage,
    table,
    legacyUserId: LEGACY,
    userName: user.Item.name,
    activeGameCount: activeGames.length,
    activeGames: activeGames.map((g) => ({
      id: g.id ?? g.sk,
      metaGame: g.metaGame,
      toMove: g.toMove,
      lastMoveTime: g.lastMoveTime,
      players: g.players?.map((p) => ({ id: p.id, name: p.name })),
    })),
    challengesReceivedCount: challenges.length,
    challengesReceived: challenges.map((c) => ({
      id: c.id ?? c.sk,
      metaGame: c.metaGame,
      standing: c.standing === true,
      challenger: c.challenger,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!execute) {
    console.error('\nDry run. Add --execute to decline open challenges and resign active games.');
    return;
  }

  const { respondedChallenge } = await import('../lib/challenges/authHandlers.js');
  const { submitMove } = await import('../lib/games/playHandlers.js');

  if (!resignOnly) {
  for (const c of challenges) {
    const full = await client.send(new GetCommand({
      TableName: table,
      Key: c.standing === true
        ? { pk: `STANDINGCHALLENGE#${c.metaGame}`, sk: String(c.id ?? c.sk) }
        : { pk: 'CHALLENGE', sk: String(c.id ?? c.sk) },
    }));
    console.error('Challenge record:', JSON.stringify(full.Item, null, 2));
    const challengeId = String(c.id ?? c.sk);
    const metaGame = String(c.metaGame);
    const standing = c.standing === true;
    console.error(`Declining challenge ${metaGame} / ${challengeId} (standing=${standing})`);
    const result = await respondedChallenge(LEGACY, {
      response: false,
      id: challengeId,
      standing,
      metaGame,
      comment: 'Legacy AiAi cutover (Phase 6).',
    });
    console.error(`  ? HTTP ${result.statusCode}: ${result.body?.slice(0, 240)}`);
  }
  }

  if (!challengesOnly) {
  for (const row of activeGames) {
    const gameId = String(row.id ?? row.sk);
    const metaGame = String(row.metaGame);
    console.error(`Resigning ${metaGame} / ${gameId}`);
    const result = await submitMove(LEGACY, {
      id: gameId,
      move: 'resign',
      metaGame,
      cbit: 0,
      draw: '',
    });
    console.error(`  ? HTTP ${result.statusCode}: ${result.body?.slice(0, 240)}`);
  }
  }

  const currentAfter = await client.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `CURRENTGAMES#${LEGACY}` },
  }));
  const userAfter = await client.send(new GetCommand({
    TableName: table,
    Key: { pk: 'USER', sk: LEGACY },
  }));
  const challengesAfter = await getChallengesByIds(
    client,
    table,
    toIdArray(userAfter.Item?.challenges_received),
  );
  const activeAfter = (currentAfter.Items ?? []).filter((row) => isActiveDashboardGame(row));

  console.log(JSON.stringify({
    afterActiveGameCount: activeAfter.length,
    afterChallengesReceivedCount: challengesAfter.length,
    gateClear: activeAfter.length === 0 && challengesAfter.length === 0,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
