import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GameFactory } from '@abstractplay/gameslib';
import { verifyBotRequest } from '../lib/botVerify';
import { submitBotMove } from '../lib/botClient';
import { appendTestBotEvent, getOrCreateTestBotState, TestBotMovePolicy } from '../lib/testBotState';
import { ddbDocClient } from '../lib/ddb';

const headers = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

type OutChallengePayload = {
  verb: 'challenge';
  metaGame: string;
  variants?: string[];
};

type OutMovePayload = {
  verb: 'move';
  metaGame: string;
  variants?: string[];
  gameid: string;
  moves: string[][];
};

function jsonResponse(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers,
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recordTestBotContact(statusCode: number): Promise<void> {
  const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!clientId || !tableName) {
    return;
  }

  const reachable = statusCode > 0;
  const operational = reachable && statusCode >= 200 && statusCode < 300;
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'BOT', sk: clientId },
      ExpressionAttributeValues: {
        ':ls': Date.now(),
        ':sc': statusCode,
        ':ok': operational,
      },
      UpdateExpression: 'SET lastseen = :ls, lastStatusCode = :sc, operational = :ok',
    })
  );
}

type MoveListEngine = {
  move(move: string): void;
  moves(): string[];
};

function pickMove(
  metaGame: string,
  variants: string[],
  movePolicy: TestBotMovePolicy,
  moves: string[][]
): string {
  const engine = GameFactory(metaGame, undefined, variants) as MoveListEngine | undefined;
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }

  for (const round of moves) {
    for (const move of round) {
      engine.move(move);
    }
  }

  const legal = engine.moves();
  if (movePolicy === 'pass' && legal.includes('pass')) {
    return 'pass';
  }
  if (legal.includes('pass')) {
    return 'pass';
  }
  if (legal.length === 0) {
    throw new Error(`No legal moves for ${metaGame}`);
  }
  return legal[0];
}

async function handlePing(): Promise<APIGatewayProxyResult> {
  await appendTestBotEvent({
    ts: Date.now(),
    direction: 'inbound',
    verb: 'ping',
    summary: 'GET ping',
    statusCode: 200,
  });
  await recordTestBotContact(200);
  return jsonResponse(200, { operational: true });
}

async function handleChallenge(payload: OutChallengePayload): Promise<APIGatewayProxyResult> {
  const state = await getOrCreateTestBotState();
  const { settings } = state;

  await appendTestBotEvent({
    ts: Date.now(),
    direction: 'inbound',
    verb: 'challenge',
    summary: `challenge ${payload.metaGame}`,
  });

  if (!settings.acceptChallenges) {
    await recordTestBotContact(400);
    return jsonResponse(400, { message: 'Test bot is configured to reject challenges' });
  }

  if (settings.rejectMetaGames.includes(payload.metaGame)) {
    await recordTestBotContact(400);
    return jsonResponse(400, { message: `Test bot rejects metaGame ${payload.metaGame}` });
  }

  await recordTestBotContact(200);
  return jsonResponse(200, { accepted: true });
}

async function handleMove(payload: OutMovePayload): Promise<APIGatewayProxyResult> {
  const state = await getOrCreateTestBotState();
  const { settings } = state;

  await appendTestBotEvent({
    ts: Date.now(),
    direction: 'inbound',
    verb: 'move',
    summary: `move ${payload.metaGame} game ${payload.gameid}`,
  });

  const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
  const clientSecret = process.env.TEST_BOT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    await appendTestBotEvent({
      ts: Date.now(),
      direction: 'outbound',
      verb: 'move',
      summary: 'botQuery move not sent',
      error: 'TEST_BOT_CLIENT_ID or TEST_BOT_CLIENT_SECRET is not configured',
    });
    await recordTestBotContact(202);
    return jsonResponse(202, { queued: true, warning: 'Bot credentials not configured' });
  }

  await sleep(settings.moveDelayMs);

  let move: string;
  try {
    move = pickMove(
      payload.metaGame,
      payload.variants ?? [],
      settings.movePolicy,
      payload.moves ?? []
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await appendTestBotEvent({
      ts: Date.now(),
      direction: 'outbound',
      verb: 'move',
      summary: 'failed to pick move',
      error: message,
    });
    await recordTestBotContact(202);
    return jsonResponse(202, { queued: true, error: message });
  }

  try {
    const result = await submitBotMove({
      gameid: payload.gameid,
      metaGame: payload.metaGame,
      move,
      clientId,
      clientSecret,
    });
    await appendTestBotEvent({
      ts: Date.now(),
      direction: 'outbound',
      verb: 'move',
      summary: `submitted ${move}`,
      statusCode: result.statusCode,
      error: result.statusCode >= 300 ? result.body : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await appendTestBotEvent({
      ts: Date.now(),
      direction: 'outbound',
      verb: 'move',
      summary: 'botQuery request failed',
      error: message,
    });
  }

  await recordTestBotContact(202);
  return jsonResponse(202, { queued: true });
}

async function handlePost(
  rawBody: string,
  eventHeaders: APIGatewayProxyEvent['headers']
): Promise<APIGatewayProxyResult> {
  const verification = await verifyBotRequest(rawBody, eventHeaders ?? {});
  if (!verification.ok) {
    await appendTestBotEvent({
      ts: Date.now(),
      direction: 'inbound',
      verb: 'unknown',
      summary: 'signature verification failed',
      statusCode: 401,
      error: verification.reason,
    });
    return jsonResponse(401, { message: verification.reason });
  }

  let payload: { verb?: string };
  try {
    payload = JSON.parse(rawBody) as { verb?: string };
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON body' });
  }

  switch (payload.verb) {
    case 'challenge':
      return handleChallenge(payload as OutChallengePayload);
    case 'move':
      return handleMove(payload as OutMovePayload);
    default:
      return jsonResponse(400, { message: `Unknown verb '${payload.verb ?? ''}'` });
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('testBot', event.httpMethod, event.path);

  try {
    if (event.httpMethod === 'GET') {
      return await handlePing();
    }
    if (event.httpMethod === 'POST') {
      return await handlePost(event.body ?? '', event.headers);
    }
    return jsonResponse(405, { message: 'Method not allowed' });
  } catch (error: unknown) {
    console.error('testBot handler error', error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { message });
  }
};
