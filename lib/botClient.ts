/**
 * OAuth client_credentials + botQuery client for bot → AP communication.
 * See api/testBot.ts for the reference integration (move submission flow).
 */
import {
  isApiGatewayUnauthorized,
  summarizeJwtForLog,
  summarizeUrlForLog,
  type JwtLogSummary,
} from './botClientLog';

type TokenCache = {  accessToken: string;
  expiresAtMs: number;
};

const tokenCaches = new Map<string, TokenCache>();

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

async function fetchAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = process.env.BOT_TOKEN_URL;
  if (!tokenUrl) {
    throw new Error('BOT_TOKEN_URL environment variable is not set');
  }

  const scope = process.env.BOT_OAUTH_SCOPE?.trim();
  if (!scope) {
    throw new Error('BOT_OAUTH_SCOPE environment variable is not set');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('botClient: token request failed', {
      clientId,
      tokenUrl: summarizeUrlForLog(tokenUrl),
      scope,
      statusCode: response.status,
      body: text.slice(0, 500),
    });
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error('Token response did not include access_token');
  }

  console.log('botClient: token acquired', {
    clientId,
    tokenUrl: summarizeUrlForLog(tokenUrl),
    scope,
    expiresIn: data.expires_in,
    claims: summarizeJwtForLog(data.access_token),
  });

  const expiresInMs = Math.max(60, data.expires_in ?? 3600) * 1000;
  tokenCaches.set(clientId, {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + expiresInMs - 60_000,
  });

  return data.access_token;
}

export async function getBotAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCaches.get(clientId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }
  return fetchAccessToken(clientId, clientSecret);
}

export type SubmitBotMoveParams = {
  gameid: string;
  metaGame: string;
  move: string;
  clientId: string;
  clientSecret: string;
};

export type SubmitBotMoveResult = {
  statusCode: number;
  body: string;
  debug: {
    clientId: string;
    botQueryUrl: ReturnType<typeof summarizeUrlForLog>;
    tokenClaims: JwtLogSummary;
    retriedAuth: boolean;
    likelyApiGatewayAuthFailure: boolean;
  };
};

export async function submitBotMove(params: SubmitBotMoveParams): Promise<SubmitBotMoveResult> {
  const botQueryUrl = process.env.BOT_QUERY_URL;
  if (!botQueryUrl) {
    throw new Error('BOT_QUERY_URL environment variable is not set');
  }

  const attempt = async (token: string, attemptNumber: number): Promise<SubmitBotMoveResult> => {
    const tokenClaims = summarizeJwtForLog(token);
    console.log('botClient: botQuery request', {
      attempt: attemptNumber,
      clientId: params.clientId,
      gameid: params.gameid,
      metaGame: params.metaGame,
      move: params.move,
      botQueryUrl: summarizeUrlForLog(botQueryUrl),
      tokenClaims,
    });

    const response = await fetch(botQueryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verb: 'move',
        gameid: params.gameid,
        metaGame: params.metaGame,
        move: params.move,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    const likelyApiGatewayAuthFailure = isApiGatewayUnauthorized(response.status, body);
    const result: SubmitBotMoveResult = {
      statusCode: response.status,
      body,
      debug: {
        clientId: params.clientId,
        botQueryUrl: summarizeUrlForLog(botQueryUrl),
        tokenClaims,
        retriedAuth: false,
        likelyApiGatewayAuthFailure,
      },
    };

    console.log('botClient: botQuery response', {
      attempt: attemptNumber,
      clientId: params.clientId,
      statusCode: result.statusCode,
      likelyApiGatewayAuthFailure,
      body: body.slice(0, 500),
      tokenClaims,
    });

    if (likelyApiGatewayAuthFailure) {
      console.warn(
        'botClient: 401 Unauthorized with API Gateway body — botQuery Lambda was likely not invoked. '
        + 'If the access token already has the correct scope, ensure API Gateway botAuthorizer declares the same OAuth scope '
        + '(without scopes, Cognito authorizers expect an ID token, not an M2M access token). '
        + 'Also verify BOT_OAUTH_SCOPE on the Cognito app client and BOT_QUERY_URL stage.'
      );
    }

    return result;
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
