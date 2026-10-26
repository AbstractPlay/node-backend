import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../api/clients.js';
import {
  DEV_AUTH_QUERY_URL,
  DEV_COGNITO_CLIENT_ID,
} from './devStageConfig.js';

export type DevTestPlayer = {
  /** Cognito `sub` (optional; for logs and DDB audits). */
  userId?: string;
  label?: string;
  refreshToken?: string;
  /** Short-lived override — avoid committing; prefer refreshToken. */
  idToken?: string;
};

export type DevTestPlayersManifest = {
  authQueryUrl?: string;
  cognitoClientId?: string;
  /** Fallback `pars` keys for dev-auth-query CLI (e.g. `ladderId`, `tournamentId`). */
  defaults?: Record<string, string>;
  /** @deprecated use `defaults.ladderId` */
  defaultLadderId?: string;
  players: Record<string, DevTestPlayer>;
};

const tokenCache = new Map<string, { idToken: string; expiresAtMs: number }>();

function jwtExpMs(idToken: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'),
    ) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export function manifestDefaults(manifest: DevTestPlayersManifest): Record<string, string> {
  const out: Record<string, string> = { ...(manifest.defaults ?? {}) };
  if (manifest.defaultLadderId !== undefined && out.ladderId === undefined) {
    out.ladderId = manifest.defaultLadderId;
  }
  return out;
}

export async function loadDevTestPlayersManifest(
  manifestPath: string,
): Promise<DevTestPlayersManifest> {
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as DevTestPlayersManifest;
  if (!parsed.players || typeof parsed.players !== 'object') {
    throw new Error('Manifest must include a players object');
  }
  return parsed;
}

export function resolveDevTestPlayersPath(): string {
  if (process.env.AP_DEV_TEST_PLAYERS) {
    return process.env.AP_DEV_TEST_PLAYERS;
  }
  if (process.env.AP_LADDER_DEV_PLAYERS) {
    return process.env.AP_LADDER_DEV_PLAYERS;
  }
  return path.join(
    fileURLToPath(new URL('../../test/fixtures/dev-test-players.json', import.meta.url)),
  );
}

async function refreshIdToken(
  refreshToken: string,
  clientId: string,
): Promise<string> {
  const result = await cognitoClient.send(new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  }));
  const idToken = result.AuthenticationResult?.IdToken;
  if (idToken === undefined) {
    throw new Error('Cognito refresh did not return IdToken');
  }
  return idToken;
}

export async function getIdTokenForPlayer(
  manifest: DevTestPlayersManifest,
  playerKey: string,
): Promise<string> {
  const player = manifest.players[playerKey];
  if (player === undefined) {
    throw new Error(`Unknown player key "${playerKey}"`);
  }
  const clientId = manifest.cognitoClientId ?? DEV_COGNITO_CLIENT_ID;
  const cached = tokenCache.get(playerKey);
  if (cached !== undefined && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.idToken;
  }
  if (player.idToken !== undefined && player.idToken.length > 0) {
    const exp = jwtExpMs(player.idToken);
    if (exp > Date.now() + 60_000) {
      tokenCache.set(playerKey, { idToken: player.idToken, expiresAtMs: exp });
      return player.idToken;
    }
  }
  if (player.refreshToken === undefined || player.refreshToken.length === 0) {
    throw new Error(
      `Player "${playerKey}" needs refreshToken or unexpired idToken in the manifest`,
    );
  }
  const idToken = await refreshIdToken(player.refreshToken, clientId);
  tokenCache.set(playerKey, {
    idToken,
    expiresAtMs: jwtExpMs(idToken),
  });
  return idToken;
}

export type AuthQueryResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; statusCode: number; message: string; raw?: unknown };

function parseAuthQueryEnvelope(text: string): AuthQueryResult {
  const parsed = JSON.parse(text) as {
    statusCode?: number;
    body?: string;
  };
  if (parsed.statusCode !== undefined) {
    const statusCode = parsed.statusCode;
    let body: unknown = parsed.body;
    if (typeof body === 'string' && body.trim().startsWith('{')) {
      try {
        body = JSON.parse(body);
      } catch {
        /* plain string body */
      }
    }
    if (statusCode !== 200) {
      const message = typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : String(body ?? statusCode);
      return { ok: false, statusCode, message, raw: body };
    }
    return { ok: true, data: body };
  }
  return { ok: true, data: parsed };
}

export async function authQueryAsPlayer(
  manifest: DevTestPlayersManifest,
  playerKey: string,
  query: string,
  pars: Record<string, unknown> = {},
): Promise<AuthQueryResult> {
  const idToken = await getIdTokenForPlayer(manifest, playerKey);
  const url = manifest.authQueryUrl ?? DEV_AUTH_QUERY_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ query, pars }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, statusCode: res.status, message: text || res.statusText };
  }
  if (!text.trim()) {
    return { ok: true, data: null };
  }
  try {
    return parseAuthQueryEnvelope(text);
  } catch (err) {
    return {
      ok: false,
      statusCode: res.status,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
