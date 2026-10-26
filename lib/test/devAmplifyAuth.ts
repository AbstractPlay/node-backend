/**
 * Cognito auth for local dev tooling — same Amplify Auth config as front `amplifyAuth.js`.
 */
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signInWithRedirect,
  signOut,
  type SignInOutput,
} from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage } from 'aws-amplify/utils';
import {
  DEV_COGNITO_CLIENT_ID,
  DEV_COGNITO_DOMAIN,
  DEV_COGNITO_REDIRECT_LOGIN,
  DEV_COGNITO_REDIRECT_LOGOUT,
  DEV_COGNITO_USER_POOL_ID,
} from './devStageConfig.js';

let configured = false;

export type DevAmplifyTokens = {
  refreshToken: string;
  idToken: string;
  sub?: string;
};

export function subFromIdToken(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'),
    ) as { sub?: string };
    return payload.sub;
  } catch {
    return undefined;
  }
}

export function configureDevAmplifyAuth(): void {
  if (configured) {
    return;
  }
  configured = true;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: DEV_COGNITO_USER_POOL_ID,
        userPoolClientId: DEV_COGNITO_CLIENT_ID,
        loginWith: {
          oauth: {
            domain: DEV_COGNITO_DOMAIN,
            scopes: ['openid', 'email', 'aws.cognito.signin.user.admin'],
            redirectSignIn: [DEV_COGNITO_REDIRECT_LOGIN],
            redirectSignOut: [DEV_COGNITO_REDIRECT_LOGOUT],
            responseType: 'code',
          },
        },
      },
    },
  });

  cognitoUserPoolsTokenProvider.setKeyValueStorage(defaultStorage);
}

function openBrowser(url: string): void {
  const escaped = url.replace(/"/g, '\\"');
  const cmd = process.platform === 'win32'
    ? `start "" "${escaped}"`
    : process.platform === 'darwin'
      ? `open "${escaped}"`
      : `xdg-open "${escaped}"`;
  exec(cmd);
}

function waitForOAuthRedirect(
  redirectUri: string,
  timeoutMs = 180_000,
): Promise<string> {
  const expected = new URL(redirectUri);
  const port = expected.port
    ? Number.parseInt(expected.port, 10)
    : expected.protocol === 'https:' ? 443 : 80;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const host = req.headers.host ?? `127.0.0.1:${port}`;
      const currentUrl = new URL(req.url ?? '/', `${expected.protocol}//${host}`).toString();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p>Sign-in complete. You can close this tab.</p>');
      server.close();
      clearTimeout(timer);
      resolve(currentUrl);
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for Cognito redirect (3 minutes)'));
    }, timeoutMs);

    server.listen(port, '127.0.0.1');
  });
}

async function readStoredTokens(): Promise<DevAmplifyTokens> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (idToken === undefined || idToken.length === 0) {
    throw new Error('Amplify session has no id token after sign-in');
  }
  const stored = await cognitoUserPoolsTokenProvider.authTokenStore.loadTokens();
  const refreshToken = stored?.refreshToken;
  if (refreshToken === undefined || refreshToken.length === 0) {
    throw new Error('Amplify session has no refresh token after sign-in');
  }
  return {
    refreshToken,
    idToken,
    sub: subFromIdToken(idToken),
  };
}

async function completeSignInSteps(
  initial: SignInOutput,
  challengeResponse: (step: string) => Promise<string>,
): Promise<void> {
  let step = initial;
  for (;;) {
    const signInStep = step.nextStep.signInStep;
    if (signInStep === 'DONE') {
      return;
    }
    if (
      signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'
      || signInStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE'
      || signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
    ) {
      const code = await challengeResponse(signInStep);
      step = await confirmSignIn({ challengeResponse: code });
      continue;
    }
    throw new Error(`Unsupported Cognito sign-in step: ${signInStep}`);
  }
}

/** Same hosted UI + authorization-code flow as play.dev (`signInWithRedirect`). */
export async function signInDevWithHostedUi(): Promise<DevAmplifyTokens> {
  configureDevAmplifyAuth();
  await signOut().catch(() => undefined);

  const redirectUri = DEV_COGNITO_REDIRECT_LOGIN;
  console.log(`Opening Cognito hosted UI (redirect ${redirectUri})…`);
  console.log(
    'If login fails with redirect_mismatch, add this URL to the dev app client callback URLs in Cognito.',
  );

  const listener = waitForOAuthRedirect(redirectUri);

  await signInWithRedirect({
    options: {
      authSessionOpener: async (authorizeUrl) => {
        openBrowser(authorizeUrl);
        const callbackUrl = await listener;
        return { type: 'success', url: callbackUrl };
      },
    },
  });

  return readStoredTokens();
}

/** Username/password via Amplify SRP (same app client; optional for password-only dev users). */
export async function signInDevWithPassword(
  username: string,
  password: string,
  challengeResponse: (step: string) => Promise<string>,
): Promise<DevAmplifyTokens> {
  configureDevAmplifyAuth();
  await signOut().catch(() => undefined);

  const result = await signIn({ username: username.trim(), password });
  await completeSignInSteps(result, challengeResponse);
  return readStoredTokens();
}
