/**
 * ============================================================================
 * Abstract Play — reference bot implementation
 * ============================================================================
 *
 * This file is the **complete** source for AP's dev-only test bot. Bot authors
 * should treat it as the canonical example of how to integrate with Abstract Play.
 *
 * Supporting libraries used by this bot (and reusable in your own deployment):
 *
 *   lib/botVerify.ts  — verify inbound AP webhook signatures (Ed25519)
 *   lib/botClient.ts    — OAuth client_credentials token + POST moves to botQuery
 *
 * Everything else you need to study or copy is in **this file**.
 *
 * ---------------------------------------------------------------------------
 * Protocol overview
 * ---------------------------------------------------------------------------
 *
 * AP talks to your bot over HTTPS. Your bot talks back to AP's `botQuery`
 * endpoint using a Cognito M2M access token.
 *
 *   1. PING (availability)
 *      AP  →  GET  https://your-bot.example/ping-or-root
 *      You ←  200 { "operational": true }
 *
 *   2. CHALLENGE (synchronous accept/reject)
 *      AP  →  POST https://your-bot.example/   (signed JSON body)
 *      Body: { verb: "challenge", metaGame, variants, clockStart, clockInc,
 *              clockMax, challengers }
 *      You ←  200 accept  |  400 reject
 *
 *   3. MOVE (async processing)
 *      AP  →  POST https://your-bot.example/   (signed JSON body)
 *      Body: { verb: "move", metaGame, variants, gameid, clockCurr, numPlayers,
 *              moves, context? }
 *      You ←  202 immediately (queue work in background)
 *      You →  POST https://api…/botQuery       (Bearer access token)
 *      Body: { verb: "move", gameid, metaGame, move }
 *      AP  ←  200 + updated game JSON on success
 *
 * Full protocol docs: /backend/bots/ (node-backend docs; wiki RFC is legacy)
 *
 * ---------------------------------------------------------------------------
 * Inbound authentication (AP → your bot)
 * ---------------------------------------------------------------------------
 *
 * Every POST from AP includes:
 *
 *   X-Signature-Timestamp  — Unix seconds when AP signed the request
 *   X-Signature-Nonce      — one-time random string
 *   X-Signature            — base64 Ed25519 signature
 *
 * Signing string:  `${timestamp}.${nonce}.${rawRequestBody}`
 *
 * Reject requests older than 5 minutes (replay protection). Use the **raw**
 * request body bytes — do not re-serialize JSON. See `verifyBotRequest()` in
 * lib/botVerify.ts (called in `handlePost` below).
 *
 * ---------------------------------------------------------------------------
 * Outbound authentication (your bot → AP)
 * ---------------------------------------------------------------------------
 *
 * Dev and production use **separate** Cognito bot pools, token URLs, OAuth scopes,
 * DynamoDB tables, and botQuery base URLs. Register and test on dev first; create a
 * new bot on production when you are ready for wide release (credentials do not transfer).
 *
 *   Dev:  BOT_TOKEN_URL → abstract-play-bots-dev.auth…/oauth2/token
 *         BOT_OAUTH_SCOPE → default-m2m-resource-server-dev/communicate
 *         botQuery → …/dev/botQuery
 *   Prod: BOT_TOKEN_URL → https://botauth.abstractplay.com/oauth2/token
 *         BOT_OAUTH_SCOPE → default-m2m-resource-server-zssvzy/communicate
 *         botQuery → …/prod/botQuery
 *
 * 1. POST to BOT_TOKEN_URL with grant_type=client_credentials, client_id,
 *    client_secret, and scope (see lib/botClient.ts).
 * 2. Cache the access_token until shortly before expires_in.
 * 3. POST moves to BOT_QUERY_URL with Authorization: Bearer <token>.
 * 4. On HTTP 401, refresh the token once and retry.
 *
 * ---------------------------------------------------------------------------
 * Environment variables (test bot Lambda on dev)
 * ---------------------------------------------------------------------------
 *
 *   TEST_BOT_CLIENT_ID      — Dev-pool Cognito client id (= bot player id, JWT sub)
 *   TEST_BOT_CLIENT_SECRET  — Dev-pool client secret for M2M token
 *   BOT_TOKEN_URL           — Dev OAuth token endpoint (serverless stageConfig.dev)
 *   BOT_QUERY_URL           — Dev botQuery URL (…/dev/botQuery)
 *   BOT_OAUTH_SCOPE         — Dev OAuth scope (default-m2m-resource-server-dev/communicate)
 *   ABSTRACT_PLAY_TABLE     — DynamoDB table (test bot event log + BOT record)
 *   API_BASE_URL            — Used by dashboard to show this bot's public URL
 *
 * ---------------------------------------------------------------------------
 * Dev dashboard (not part of a production bot)
 * ---------------------------------------------------------------------------
 *
 * The test bot also exposes authQuery handlers (`testBotStatus`, `updateTestBot`)
 * so the fixed owner can inspect recent traffic and tweak behaviour. Production
 * bots manage their own logging and configuration.
 *
 * ---------------------------------------------------------------------------
 * Adapting this for your bot
 * ---------------------------------------------------------------------------
 *
 * 1. Host any HTTPS server (Lambda, Cloud Run, VPS, …).
 * 2. Implement GET ping + signed POST handler (copy `handlePost` flow).
 * 3. On move: return 202 quickly, compute move, call botQuery via botClient.
 * 4. Register the bot in AP (createBot) with your endpoint URL and upload your
 *    public key if you also verify signatures locally.
 *
 * The `pickMove` function below is intentionally simple (replay `moves` through
 * the gameslib engine, then play the first legal move). Replace it with your
 * engine / search / ML pipeline.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GameFactory } from '@abstractplay/gameslib';
import { verifyBotRequest } from '../lib/botVerify';
import { submitBotMove } from '../lib/botClient';
import { getBotRecord } from '../lib/participants';
import { ddbDocClient } from '../lib/ddb';

// =============================================================================
// Test-bot dashboard state (dev only — production bots use their own storage)
// =============================================================================

/** AP user id allowed to view/edit test bot settings in the dev UI. */
export const TEST_BOT_OWNER_ID = '3ccb3a1f-3d25-441e-9efc-e526eac4fe9a';

const TEST_BOT_PK = 'TESTBOT';
const TEST_BOT_SK = 'dev';
const MAX_EVENTS = 50;

export type TestBotMovePolicy = 'pass' | 'firstLegal';

export type TestBotSettings = {
  acceptChallenges: boolean;
  rejectMetaGames: string[];
  movePolicy: TestBotMovePolicy;
  moveDelayMs: number;
};

export type TestBotEvent = {
  ts: number;
  direction: 'inbound' | 'outbound';
  verb: string;
  summary: string;
  statusCode?: number;
  error?: string;
  detail?: Record<string, unknown>;
};

export type TestBotState = {
  pk: string;
  sk: string;
  owner: string;
  settings: TestBotSettings;
  recentEvents: TestBotEvent[];
};

export const DEFAULT_TEST_BOT_SETTINGS: TestBotSettings = {
  acceptChallenges: true,
  rejectMetaGames: [],
  movePolicy: 'firstLegal',
  moveDelayMs: 0,
};

function defaultTestBotState(): TestBotState {
  return {
    pk: TEST_BOT_PK,
    sk: TEST_BOT_SK,
    owner: TEST_BOT_OWNER_ID,
    settings: { ...DEFAULT_TEST_BOT_SETTINGS, rejectMetaGames: [] },
    recentEvents: [],
  };
}

export async function getOrCreateTestBotState(): Promise<TestBotState> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
    })
  );

  if (data.Item) {
    return data.Item as TestBotState;
  }

  const item = defaultTestBotState();
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name !== 'ConditionalCheckFailedException') {
      throw error;
    }
    const retry = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      })
    );
    if (!retry.Item) {
      throw error;
    }
    return retry.Item as TestBotState;
  }

  return item;
}

async function appendTestBotEvent(event: TestBotEvent): Promise<void> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const state = await getOrCreateTestBotState();
  const recentEvents = [...(state.recentEvents ?? []), event].slice(-MAX_EVENTS);

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ':events': recentEvents },
      UpdateExpression: 'SET recentEvents = :events',
    })
  );
}

export async function updateTestBotSettings(patch: Partial<TestBotSettings>): Promise<TestBotSettings> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const state = await getOrCreateTestBotState();
  const settings: TestBotSettings = {
    ...state.settings,
    ...patch,
    rejectMetaGames: patch.rejectMetaGames ?? state.settings.rejectMetaGames ?? [],
  };

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ':settings': settings },
      UpdateExpression: 'SET settings = :settings',
    })
  );

  return settings;
}

export function isTestBotOwner(userId: string | undefined): boolean {
  return userId === TEST_BOT_OWNER_ID;
}

// =============================================================================
// authQuery dashboard handlers (wired from abstractplay.ts — dev only)
// =============================================================================

type PartialClaims = { sub?: string };

const dashboardHeaders = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

function dashboardForbidden() {
  return {
    statusCode: 403,
    body: JSON.stringify({ message: 'You are not authorized to access the test bot dashboard' }),
    headers: dashboardHeaders,
  };
}

function dashboardError(message: string) {
  return {
    statusCode: 500,
    body: JSON.stringify({ message }),
    headers: dashboardHeaders,
  };
}

/** authQuery: test_bot_status — recent events, settings, and BOT record health. */
export async function testBotStatus(claim: PartialClaims) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }

  try {
    const state = await getOrCreateTestBotState();
    const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
    const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
    const endpointUrl = apiBase ? `${apiBase}/testBot` : undefined;

    let botRecord: {
      lastseen?: number;
      operational?: boolean;
      lastStatusCode?: number;
      name?: string;
      endpoint?: string;
    } | undefined;

    if (clientId) {
      const bot = await getBotRecord(clientId);
      if (bot) {
        botRecord = {
          lastseen: bot.lastseen,
          operational: (bot as { operational?: boolean }).operational,
          lastStatusCode: (bot as { lastStatusCode?: number }).lastStatusCode,
          name: bot.name,
          endpoint: bot.endpoint,
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        endpointUrl,
        clientIdConfigured: Boolean(clientId),
        clientId: clientId ?? null,
        settings: state.settings,
        recentEvents: state.recentEvents ?? [],
        botRecord: botRecord ?? null,
      }),
      headers: dashboardHeaders,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error loading test bot status:', error);
    return dashboardError(`Unable to load test bot status: ${message}`);
  }
}

/** authQuery: update_test_bot — change acceptChallenges, movePolicy, etc. */
export async function updateTestBot(
  claim: PartialClaims,
  pars: {
    acceptChallenges?: boolean;
    rejectMetaGames?: string[];
    movePolicy?: TestBotMovePolicy;
    moveDelayMs?: number;
  }
) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }

  const patch: Partial<TestBotSettings> = {};
  if (pars.acceptChallenges !== undefined) {
    patch.acceptChallenges = pars.acceptChallenges;
  }
  if (pars.rejectMetaGames !== undefined) {
    patch.rejectMetaGames = pars.rejectMetaGames;
  }
  if (pars.movePolicy !== undefined) {
    if (pars.movePolicy !== 'pass' && pars.movePolicy !== 'firstLegal') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "movePolicy must be 'pass' or 'firstLegal'" }),
        headers: dashboardHeaders,
      };
    }
    patch.movePolicy = pars.movePolicy;
  }
  if (pars.moveDelayMs !== undefined) {
    if (!Number.isFinite(pars.moveDelayMs) || pars.moveDelayMs < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'moveDelayMs must be a non-negative number' }),
        headers: dashboardHeaders,
      };
    }
    patch.moveDelayMs = Math.floor(pars.moveDelayMs);
  }

  if (Object.keys(patch).length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'No test bot settings were provided' }),
      headers: dashboardHeaders,
    };
  }

  try {
    const settings = await updateTestBotSettings(patch);
    return {
      statusCode: 200,
      body: JSON.stringify({ settings }),
      headers: dashboardHeaders,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating test bot settings:', error);
    return dashboardError(`Unable to update test bot settings: ${message}`);
  }
}

// =============================================================================
// Inbound webhook — AP → bot (Lambda handler)
// =============================================================================

/** Payload AP sends when a human challenges this bot. */
type OutChallengePayload = {
  verb: 'challenge';
  metaGame: string;
  variants?: string[];
};

/** Payload AP sends when it is this bot's turn. */
type OutMovePayload = {
  verb: 'move';
  metaGame: string;
  variants?: string[];
  gameid: string;
  moves: string[][];
};

const webhookHeaders = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

function jsonResponse(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: webhookHeaders,
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Updates the shared BOT# record so AP knows this endpoint is reachable. */
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

/**
 * Reference move selection: replay `moves` (rounds × players) into a fresh engine,
 * then return the first legal move. Replace this with your own logic.
 */
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

  // Optional artificial delay (dashboard setting) — real bots should still return 202 quickly.
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
      detail: result.statusCode >= 300 ? { ...result.debug } : undefined,
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

/** Lambda entry point — GET ping, POST signed challenge/move webhooks. */
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
