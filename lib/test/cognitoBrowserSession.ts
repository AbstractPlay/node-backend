import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient } from '../api/clients.js';
import {
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from './devTestPlayers.js';
import { DEV_COGNITO_CLIENT_ID } from './devStageConfig.js';

export type CognitoBrowserSession = {
  clientId: string;
  username: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
};

function decodePayload(idToken: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

export async function refreshCognitoBrowserSession(
  refreshToken: string,
  clientId: string = DEV_COGNITO_CLIENT_ID,
): Promise<CognitoBrowserSession> {
  const result = await cognitoClient.send(new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  }));
  const idToken = result.AuthenticationResult?.IdToken;
  const accessToken = result.AuthenticationResult?.AccessToken;
  if (!idToken || !accessToken) {
    throw new Error('Cognito refresh missing IdToken or AccessToken');
  }
  const payload = decodePayload(idToken);
  const username = String(
    payload['cognito:username'] ?? payload.sub ?? '',
  );
  if (!username) {
    throw new Error('Could not resolve cognito username from IdToken');
  }
  return {
    clientId,
    username,
    idToken,
    accessToken,
    refreshToken,
  };
}

export async function cognitoSessionForPlayer(
  playerKey: string,
): Promise<CognitoBrowserSession> {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const player = manifest.players[playerKey];
  if (!player?.refreshToken) {
    throw new Error(`Player ${playerKey} needs refreshToken`);
  }
  return refreshCognitoBrowserSession(
    player.refreshToken,
    manifest.cognitoClientId ?? DEV_COGNITO_CLIENT_ID,
  );
}

/** JS to run in browser on play.dev.abstractplay.com to seed Amplify CookieStorage keys. */
export function buildAmplifyCookieInjectionScript(session: CognitoBrowserSession): string {
  const { clientId, username, idToken, accessToken, refreshToken } = session;
  const prefix = 'CognitoIdentityServiceProvider';
  const id = `${clientId}.${username}`;
  const cookies: Record<string, string> = {
    [`${prefix}.${clientId}.LastAuthUser`]: username,
    [`${prefix}.${id}.accessToken`]: accessToken,
    [`${prefix}.${id}.idToken`]: idToken,
    [`${prefix}.${id}.refreshToken`]: refreshToken,
    [`${prefix}.${id}.clockDrift`]: '0',
  };
  return `(function(){
    const entries = ${JSON.stringify(cookies)};
    const maxAge = 604800;
    for (const [name, value] of Object.entries(entries)) {
      document.cookie = name + '=' + value + '; path=/; max-age=' + maxAge + '; secure; samesite=lax';
    }
    return Object.keys(entries).length;
  })()`;
}
