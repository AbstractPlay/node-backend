// api/testBot.ts
import { GetCommand as GetCommand2, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GameFactory } from "@abstractplay/gameslib";

// lib/botVerify.ts
import { createPublicKey, verify } from "crypto";
var AP_PUBLIC_KEY_URL = "https://play.abstractplay.com/ap-public-key.txt";
var DEFAULT_SSH_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINBTbzcpb7MaQM3TIFzsS8YmPqqT2y+/fJgevp20lzLm";
var MAX_SIGNATURE_AGE_SEC = 5 * 60;
var cachedKey;
var fetchPromise;
function stripWrappingQuotes(value) {
  const key = value.trim();
  if (key.startsWith('"') && key.endsWith('"') || key.startsWith("'") && key.endsWith("'")) {
    return key.slice(1, -1).trim();
  }
  return key;
}
function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function decodePublicKeyEnv(raw) {
  let key = stripWrappingQuotes(raw);
  if (!key.includes("ssh-") && !key.includes("---- BEGIN")) {
    const decoded = Buffer.from(key.replace(/\s+/g, ""), "base64").toString("utf8").trim();
    if (decoded.includes("ssh-") || decoded.includes("---- BEGIN")) {
      key = decoded;
    }
  }
  return normalizeLineEndings(key);
}
function parseSsh2PublicKeyFile(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("----"));
  const base64Body = lines.filter((line) => !line.startsWith("Comment:")).join("");
  if (base64Body.startsWith("ssh-")) {
    return base64Body;
  }
  return `ssh-ed25519 ${base64Body}`;
}
function readLengthPrefixedString(buf, offset) {
  const len = buf.readUInt32BE(offset);
  offset += 4;
  return { value: buf.subarray(offset, offset + len), offset: offset + len };
}
function parseEd25519WireFormat(blob) {
  let offset = 0;
  const keyType = readLengthPrefixedString(blob, offset);
  offset = keyType.offset;
  if (keyType.value.toString() !== "ssh-ed25519") {
    throw new Error(`Unsupported SSH key type ${keyType.value.toString()}`);
  }
  const publicKey = readLengthPrefixedString(blob, offset);
  if (publicKey.value.length !== 32) {
    throw new Error("Invalid Ed25519 public key length");
  }
  return publicKey.value;
}
function extractEd25519PublicKeyBytes(keyMaterial) {
  const trimmed = keyMaterial.trim();
  if (trimmed.includes("---- BEGIN SSH2 PUBLIC KEY ----")) {
    return extractEd25519PublicKeyBytes(parseSsh2PublicKeyFile(trimmed));
  }
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  if (parts[0] === "ssh-ed25519" && parts[1]) {
    return parseEd25519WireFormat(Buffer.from(parts[1], "base64"));
  }
  if (parts.length === 1) {
    return parseEd25519WireFormat(Buffer.from(parts[0], "base64"));
  }
  throw new Error("Unsupported AP bot public key format");
}
function createEd25519PublicKey(publicKeyBytes) {
  return createPublicKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: publicKeyBytes.toString("base64url")
    },
    format: "jwk"
  });
}
function loadPublicKeyFromMaterial(keyMaterial) {
  if (keyMaterial.includes("ssh-ed25519") || keyMaterial.includes("---- BEGIN SSH2 PUBLIC KEY ----")) {
    const publicKeyBytes = extractEd25519PublicKeyBytes(keyMaterial);
    return createEd25519PublicKey(publicKeyBytes);
  }
  return createPublicKey({ key: keyMaterial, format: "pem" });
}
async function loadPublicKey() {
  if (cachedKey) {
    return cachedKey;
  }
  if (fetchPromise) {
    return fetchPromise;
  }
  fetchPromise = (async () => {
    const fromEnv = process.env.AP_BOT_PUBLIC_KEY?.trim();
    let keyMaterial = fromEnv && fromEnv.length > 0 ? decodePublicKeyEnv(fromEnv) : DEFAULT_SSH_PUBLIC_KEY;
    if (!fromEnv) {
      try {
        const response = await fetch(AP_PUBLIC_KEY_URL, { signal: AbortSignal.timeout(1e4) });
        if (response.ok) {
          keyMaterial = parseSsh2PublicKeyFile(await response.text());
        }
      } catch (error) {
        console.warn("Unable to fetch AP bot public key; using embedded default", error);
      }
    }
    cachedKey = loadPublicKeyFromMaterial(keyMaterial);
    return cachedKey;
  })();
  return fetchPromise;
}
function headerValue(headers, name) {
  const direct = headers[name];
  if (direct !== void 0) {
    return direct;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return void 0;
}
function extractBotSignatureHeaders(headers) {
  const timestamp = headerValue(headers, "X-Signature-Timestamp");
  const nonce = headerValue(headers, "X-Signature-Nonce");
  const signature = headerValue(headers, "X-Signature");
  if (!timestamp || !nonce || !signature) {
    return void 0;
  }
  return { timestamp, nonce, signature };
}
async function verifyBotRequest(rawBody, headers) {
  const sigHeaders = extractBotSignatureHeaders(headers);
  if (!sigHeaders) {
    return { ok: false, reason: "Missing signature headers" };
  }
  const timestampSec = Number.parseInt(sigHeaders.timestamp, 10);
  if (!Number.isFinite(timestampSec)) {
    return { ok: false, reason: "Invalid signature timestamp" };
  }
  const ageSec = Math.abs(Math.floor(Date.now() / 1e3) - timestampSec);
  if (ageSec > MAX_SIGNATURE_AGE_SEC) {
    return { ok: false, reason: "Signature timestamp expired" };
  }
  const signingString = `${sigHeaders.timestamp}.${sigHeaders.nonce}.${rawBody}`;
  const publicKey = await loadPublicKey();
  const valid = verify(
    null,
    Buffer.from(signingString, "utf8"),
    publicKey,
    Buffer.from(sigHeaders.signature, "base64")
  );
  if (!valid) {
    return { ok: false, reason: "Invalid signature" };
  }
  return { ok: true };
}

// lib/botClientLog.ts
function summarizeJwtForLog(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return { decodeError: "token is not a JWT" };
    }
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return {
      sub: payload.sub,
      client_id: payload.client_id,
      scope: payload.scope,
      iss: payload.iss,
      token_use: payload.token_use,
      exp: payload.exp,
      aud: payload.aud
    };
  } catch (error) {
    return { decodeError: error instanceof Error ? error.message : String(error) };
  }
}
function summarizeUrlForLog(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return { host: "invalid-url", path: url };
  }
}
function isApiGatewayUnauthorized(statusCode, body) {
  return statusCode === 401 && body.includes('"Unauthorized"');
}

// lib/botClient.ts
var tokenCaches = /* @__PURE__ */ new Map();
async function fetchAccessToken(clientId, clientSecret) {
  const tokenUrl = process.env.BOT_TOKEN_URL;
  if (!tokenUrl) {
    throw new Error("BOT_TOKEN_URL environment variable is not set");
  }
  const scope = process.env.BOT_OAUTH_SCOPE?.trim();
  if (!scope) {
    throw new Error("BOT_OAUTH_SCOPE environment variable is not set");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("botClient: token request failed", {
      clientId,
      tokenUrl: summarizeUrlForLog(tokenUrl),
      scope,
      statusCode: response.status,
      body: text.slice(0, 500)
    });
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Token response did not include access_token");
  }
  console.log("botClient: token acquired", {
    clientId,
    tokenUrl: summarizeUrlForLog(tokenUrl),
    scope,
    expiresIn: data.expires_in,
    claims: summarizeJwtForLog(data.access_token)
  });
  const expiresInMs = Math.max(60, data.expires_in ?? 3600) * 1e3;
  tokenCaches.set(clientId, {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + expiresInMs - 6e4
  });
  return data.access_token;
}
async function getBotAccessToken(clientId, clientSecret) {
  const cached = tokenCaches.get(clientId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }
  return fetchAccessToken(clientId, clientSecret);
}
async function submitBotMove(params) {
  const botQueryUrl = process.env.BOT_QUERY_URL;
  if (!botQueryUrl) {
    throw new Error("BOT_QUERY_URL environment variable is not set");
  }
  const attempt = async (token2, attemptNumber) => {
    const tokenClaims = summarizeJwtForLog(token2);
    console.log("botClient: botQuery request", {
      attempt: attemptNumber,
      clientId: params.clientId,
      gameid: params.gameid,
      metaGame: params.metaGame,
      move: params.move,
      botQueryUrl: summarizeUrlForLog(botQueryUrl),
      tokenClaims
    });
    const response = await fetch(botQueryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token2}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        verb: "move",
        gameid: params.gameid,
        metaGame: params.metaGame,
        move: params.move
      }),
      signal: AbortSignal.timeout(3e4)
    });
    const body = await response.text();
    const likelyApiGatewayAuthFailure = isApiGatewayUnauthorized(response.status, body);
    const result2 = {
      statusCode: response.status,
      body,
      debug: {
        clientId: params.clientId,
        botQueryUrl: summarizeUrlForLog(botQueryUrl),
        tokenClaims,
        retriedAuth: false,
        likelyApiGatewayAuthFailure
      }
    };
    console.log("botClient: botQuery response", {
      attempt: attemptNumber,
      clientId: params.clientId,
      statusCode: result2.statusCode,
      likelyApiGatewayAuthFailure,
      body: body.slice(0, 500),
      tokenClaims
    });
    if (likelyApiGatewayAuthFailure) {
      console.warn(
        "botClient: 401 Unauthorized with API Gateway body \u2014 botQuery Lambda was likely not invoked. If the access token already has the correct scope, ensure API Gateway botAuthorizer declares the same OAuth scope (without scopes, Cognito authorizers expect an ID token, not an M2M access token). Also verify BOT_OAUTH_SCOPE on the Cognito app client and BOT_QUERY_URL stage."
      );
    }
    return result2;
  };
  let token = await getBotAccessToken(params.clientId, params.clientSecret);
  let result = await attempt(token, 1);
  if (result.statusCode === 401) {
    tokenCaches.delete(params.clientId);
    token = await getBotAccessToken(params.clientId, params.clientSecret);
    result = await attempt(token, 2);
    result.debug.retriedAuth = true;
  }
  return result;
}

// lib/participants.ts
import { GetCommand } from "@aws-sdk/lib-dynamodb";

// lib/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

// lib/participants.ts
async function getBotRecord(clientId) {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId }
    })
  );
  return data.Item;
}

// api/testBot.ts
var TEST_BOT_OWNER_ID = "3ccb3a1f-3d25-441e-9efc-e526eac4fe9a";
var TEST_BOT_PK = "TESTBOT";
var TEST_BOT_SK = "dev";
var MAX_EVENTS = 50;
var DEFAULT_TEST_BOT_SETTINGS = {
  acceptChallenges: true,
  rejectMetaGames: [],
  movePolicy: "firstLegal",
  moveDelayMs: 0
};
function defaultTestBotState() {
  return {
    pk: TEST_BOT_PK,
    sk: TEST_BOT_SK,
    owner: TEST_BOT_OWNER_ID,
    settings: { ...DEFAULT_TEST_BOT_SETTINGS, rejectMetaGames: [] },
    recentEvents: []
  };
}
async function getOrCreateTestBotState() {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  const data = await ddbDocClient.send(
    new GetCommand2({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK }
    })
  );
  if (data.Item) {
    return data.Item;
  }
  const item = defaultTestBotState();
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)"
      })
    );
  } catch (error) {
    const err = error;
    if (err.name !== "ConditionalCheckFailedException") {
      throw error;
    }
    const retry = await ddbDocClient.send(
      new GetCommand2({
        TableName: tableName,
        Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK }
      })
    );
    if (!retry.Item) {
      throw error;
    }
    return retry.Item;
  }
  return item;
}
async function appendTestBotEvent(event) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  const state = await getOrCreateTestBotState();
  const recentEvents = [...state.recentEvents ?? [], event].slice(-MAX_EVENTS);
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ":events": recentEvents },
      UpdateExpression: "SET recentEvents = :events"
    })
  );
}
async function updateTestBotSettings(patch) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error("ABSTRACT_PLAY_TABLE environment variable is not set");
  }
  const state = await getOrCreateTestBotState();
  const settings = {
    ...state.settings,
    ...patch,
    rejectMetaGames: patch.rejectMetaGames ?? state.settings.rejectMetaGames ?? []
  };
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ":settings": settings },
      UpdateExpression: "SET settings = :settings"
    })
  );
  return settings;
}
function isTestBotOwner(userId) {
  return userId === TEST_BOT_OWNER_ID;
}
var dashboardHeaders = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*"
};
function dashboardForbidden() {
  return {
    statusCode: 403,
    body: JSON.stringify({ message: "You are not authorized to access the test bot dashboard" }),
    headers: dashboardHeaders
  };
}
function dashboardError(message) {
  return {
    statusCode: 500,
    body: JSON.stringify({ message }),
    headers: dashboardHeaders
  };
}
async function testBotStatus(claim) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }
  try {
    const state = await getOrCreateTestBotState();
    const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
    const apiBase = process.env.API_BASE_URL?.replace(/\/$/, "");
    const endpointUrl = apiBase ? `${apiBase}/testBot` : void 0;
    let botRecord;
    if (clientId) {
      const bot = await getBotRecord(clientId);
      if (bot) {
        botRecord = {
          lastseen: bot.lastseen,
          operational: bot.operational,
          lastStatusCode: bot.lastStatusCode,
          name: bot.name,
          endpoint: bot.endpoint
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
        botRecord: botRecord ?? null
      }),
      headers: dashboardHeaders
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error loading test bot status:", error);
    return dashboardError(`Unable to load test bot status: ${message}`);
  }
}
async function updateTestBot(claim, pars) {
  if (!isTestBotOwner(claim?.sub)) {
    return dashboardForbidden();
  }
  const patch = {};
  if (pars.acceptChallenges !== void 0) {
    patch.acceptChallenges = pars.acceptChallenges;
  }
  if (pars.rejectMetaGames !== void 0) {
    patch.rejectMetaGames = pars.rejectMetaGames;
  }
  if (pars.movePolicy !== void 0) {
    if (pars.movePolicy !== "pass" && pars.movePolicy !== "firstLegal") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "movePolicy must be 'pass' or 'firstLegal'" }),
        headers: dashboardHeaders
      };
    }
    patch.movePolicy = pars.movePolicy;
  }
  if (pars.moveDelayMs !== void 0) {
    if (!Number.isFinite(pars.moveDelayMs) || pars.moveDelayMs < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "moveDelayMs must be a non-negative number" }),
        headers: dashboardHeaders
      };
    }
    patch.moveDelayMs = Math.floor(pars.moveDelayMs);
  }
  if (Object.keys(patch).length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "No test bot settings were provided" }),
      headers: dashboardHeaders
    };
  }
  try {
    const settings = await updateTestBotSettings(patch);
    return {
      statusCode: 200,
      body: JSON.stringify({ settings }),
      headers: dashboardHeaders
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error updating test bot settings:", error);
    return dashboardError(`Unable to update test bot settings: ${message}`);
  }
}
var webhookHeaders = {
  "content-type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*"
};
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: webhookHeaders
  };
}
function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function recordTestBotContact(statusCode) {
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
      Key: { pk: "BOT", sk: clientId },
      ExpressionAttributeValues: {
        ":ls": Date.now(),
        ":sc": statusCode,
        ":ok": operational
      },
      UpdateExpression: "SET lastseen = :ls, lastStatusCode = :sc, operational = :ok"
    })
  );
}
function pickMove(metaGame, variants, movePolicy, moves) {
  const engine = GameFactory(metaGame, void 0, variants);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  for (const round of moves) {
    for (const move of round) {
      engine.move(move);
    }
  }
  const legal = engine.moves();
  if (movePolicy === "pass" && legal.includes("pass")) {
    return "pass";
  }
  if (legal.includes("pass")) {
    return "pass";
  }
  if (legal.length === 0) {
    throw new Error(`No legal moves for ${metaGame}`);
  }
  return legal[0];
}
async function handlePing() {
  await appendTestBotEvent({
    ts: Date.now(),
    direction: "inbound",
    verb: "ping",
    summary: "GET ping",
    statusCode: 200
  });
  await recordTestBotContact(200);
  return jsonResponse(200, { operational: true });
}
async function handleChallenge(payload) {
  const state = await getOrCreateTestBotState();
  const { settings } = state;
  await appendTestBotEvent({
    ts: Date.now(),
    direction: "inbound",
    verb: "challenge",
    summary: `challenge ${payload.metaGame}`
  });
  if (!settings.acceptChallenges) {
    await recordTestBotContact(400);
    return jsonResponse(400, { message: "Test bot is configured to reject challenges" });
  }
  if (settings.rejectMetaGames.includes(payload.metaGame)) {
    await recordTestBotContact(400);
    return jsonResponse(400, { message: `Test bot rejects metaGame ${payload.metaGame}` });
  }
  await recordTestBotContact(200);
  return jsonResponse(200, { accepted: true });
}
async function handleMove(payload) {
  const state = await getOrCreateTestBotState();
  const { settings } = state;
  await appendTestBotEvent({
    ts: Date.now(),
    direction: "inbound",
    verb: "move",
    summary: `move ${payload.metaGame} game ${payload.gameid}`
  });
  const clientId = process.env.TEST_BOT_CLIENT_ID?.trim();
  const clientSecret = process.env.TEST_BOT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    await appendTestBotEvent({
      ts: Date.now(),
      direction: "outbound",
      verb: "move",
      summary: "botQuery move not sent",
      error: "TEST_BOT_CLIENT_ID or TEST_BOT_CLIENT_SECRET is not configured"
    });
    await recordTestBotContact(202);
    return jsonResponse(202, { queued: true, warning: "Bot credentials not configured" });
  }
  await sleep(settings.moveDelayMs);
  let move;
  try {
    move = pickMove(
      payload.metaGame,
      payload.variants ?? [],
      settings.movePolicy,
      payload.moves ?? []
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendTestBotEvent({
      ts: Date.now(),
      direction: "outbound",
      verb: "move",
      summary: "failed to pick move",
      error: message
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
      clientSecret
    });
    await appendTestBotEvent({
      ts: Date.now(),
      direction: "outbound",
      verb: "move",
      summary: `submitted ${move}`,
      statusCode: result.statusCode,
      error: result.statusCode >= 300 ? result.body : void 0,
      detail: result.statusCode >= 300 ? { ...result.debug } : void 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendTestBotEvent({
      ts: Date.now(),
      direction: "outbound",
      verb: "move",
      summary: "botQuery request failed",
      error: message
    });
  }
  await recordTestBotContact(202);
  return jsonResponse(202, { queued: true });
}
async function handlePost(rawBody, eventHeaders) {
  const verification = await verifyBotRequest(rawBody, eventHeaders ?? {});
  if (!verification.ok) {
    await appendTestBotEvent({
      ts: Date.now(),
      direction: "inbound",
      verb: "unknown",
      summary: "signature verification failed",
      statusCode: 401,
      error: verification.reason
    });
    return jsonResponse(401, { message: verification.reason });
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { message: "Invalid JSON body" });
  }
  switch (payload.verb) {
    case "challenge":
      return handleChallenge(payload);
    case "move":
      return handleMove(payload);
    default:
      return jsonResponse(400, { message: `Unknown verb '${payload.verb ?? ""}'` });
  }
}
var handler = async (event) => {
  console.log("testBot", event.httpMethod, event.path);
  try {
    if (event.httpMethod === "GET") {
      return await handlePing();
    }
    if (event.httpMethod === "POST") {
      return await handlePost(event.body ?? "", event.headers);
    }
    return jsonResponse(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("testBot handler error", error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { message });
  }
};
export {
  DEFAULT_TEST_BOT_SETTINGS,
  TEST_BOT_OWNER_ID,
  getOrCreateTestBotState,
  handler,
  isTestBotOwner,
  testBotStatus,
  updateTestBot,
  updateTestBotSettings
};
