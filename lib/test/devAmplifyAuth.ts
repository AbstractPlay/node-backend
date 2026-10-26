/**
 * Dev Cognito sign-in for CLI tooling — same user pool + app client as play.dev.
 * Issues refresh tokens for `devTestPlayers` → Bearer IdToken on `DEV_AUTH_QUERY_URL`
 * (same `authQuery` endpoint the browser uses after Amplify session).
 */
import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signOut,
  type SignInOutput,
} from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage } from 'aws-amplify/utils';
import {
  DEV_COGNITO_CLIENT_ID,
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

/** Pool/client only — no OAuth (hosted UI needs `window`; CLI uses USER_SRP_AUTH via `signIn`). */
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
      },
    },
  });

  cognitoUserPoolsTokenProvider.setKeyValueStorage(defaultStorage);
}

async function readStoredTokens(): Promise<DevAmplifyTokens> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (idToken === undefined || idToken.length === 0) {
    throw new Error('Cognito session has no id token after sign-in');
  }
  const stored = await cognitoUserPoolsTokenProvider.authTokenStore.loadTokens();
  const refreshToken = stored?.refreshToken;
  if (refreshToken === undefined || refreshToken.length === 0) {
    throw new Error('Cognito session has no refresh token after sign-in');
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
    if (signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      throw new Error(
        'Cognito requires a new password. Set a permanent password in play.dev, then retry.',
      );
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

/** Email/password (USER_SRP_AUTH) — same tokens the front sends to `authQuery`. */
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
