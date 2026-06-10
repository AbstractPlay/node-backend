type TokenCache = {
  accessToken: string;
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

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'default-m2m-resource-server-zssvzy/communicate',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error('Token response did not include access_token');
  }

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
};

export async function submitBotMove(params: SubmitBotMoveParams): Promise<SubmitBotMoveResult> {
  const botQueryUrl = process.env.BOT_QUERY_URL;
  if (!botQueryUrl) {
    throw new Error('BOT_QUERY_URL environment variable is not set');
  }

  const attempt = async (token: string): Promise<SubmitBotMoveResult> => {
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
    return { statusCode: response.status, body };
  };

  let token = await getBotAccessToken(params.clientId, params.clientSecret);
  let result = await attempt(token);
  if (result.statusCode === 401) {
    tokenCaches.delete(params.clientId);
    token = await getBotAccessToken(params.clientId, params.clientSecret);
    result = await attempt(token);
  }

  return result;
}
