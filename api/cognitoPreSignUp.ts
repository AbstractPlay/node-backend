import { ListUsersCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import {
  applyPreSignUpChecks,
  PreSignUpRejected,
  type PreSignUpTriggerEvent,
} from '../lib/cognito/preSignUp.js';

const cognito = new CognitoIdentityProviderClient({});

function userPoolIdFromEnv(): string {
  const id = process.env.userpoolId?.trim();
  if (!id) {
    throw new Error('Missing userpoolId environment variable');
  }
  return id;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function emailAlreadyRegistered(normalizedEmail: string): Promise<boolean> {
  const userPoolId = userPoolIdFromEnv();
  const filter = `email = "${escapeFilterValue(normalizedEmail)}"`;
  const res = await cognito.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: filter,
    Limit: 1,
  }));
  return (res.Users?.length ?? 0) > 0;
}

export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  try {
    return await applyPreSignUpChecks(event, {
      emailInUse: emailAlreadyRegistered,
    });
  } catch (err) {
    if (err instanceof PreSignUpRejected) {
      throw err;
    }
    console.error('cognitoPreSignUp failed', err);
    throw err;
  }
}