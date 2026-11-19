import { createHash } from 'crypto';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { headers } from '../api/http.js';
import type { ApiHandlerResult } from '../api/routeTypes.js';
import { createSendEmailCommand, initi18n } from '../api/i18n.js';
import { sesClient } from '../api/clients.js';
import { sendOutboundSes } from '../sesOutbound.js';
import i18n from '../i18nInstance.js';

export const REMIND_USERNAME_EMAIL_DAILY_LIMIT = 5;
export const REMIND_USERNAME_IP_DAILY_LIMIT = 25;
const EMAIL_MAX_LEN = 254;

export type RemindUsernamePars = {
  email?: string;
  _clientIp?: string;
};

export type RemindUsernameDeps = {
  tableName: string;
  userPoolId: string;
  playBaseUrl: string;
  cognito?: CognitoIdentityProviderClient;
  docClient: DynamoDBDocumentClient;
  now?: () => number;
};

const UNIFORM_BODY = { ok: true as const };

function startOfUtcDayIso(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function hashBucket(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function normalizeRemindEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LEN) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

function cognitoEmailFilter(email: string): string {
  const escaped = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `email = "${escaped}"`;
}

export function pickConfirmedUsersWithEmail(users: UserType[] | undefined): UserType[] {
  if (!users?.length) {
    return [];
  }
  return users.filter(
    (u) => u.UserStatus === 'CONFIRMED'
      && u.Attributes?.some((a) => a.Name === 'email' && typeof a.Value === 'string' && a.Value !== ''),
  );
}

async function countRateEvents(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<number> {
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
      Select: 'COUNT',
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

async function recordRateEvent(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  sk: string,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk,
      sk,
      ttl: Math.floor(Date.now() / 1000) + 86_400 * 8,
    },
  }));
}

async function listUsersByEmail(
  cognito: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<UserType[]> {
  const users: UserType[] = [];
  let paginationToken: string | undefined;
  do {
    const page = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: cognitoEmailFilter(email),
      Limit: 60,
      PaginationToken: paginationToken,
    }));
    if (page.Users?.length) {
      users.push(...page.Users);
    }
    paginationToken = page.PaginationToken;
  } while (paginationToken);
  return users;
}

export async function remindUsername(
  pars: RemindUsernamePars,
  deps: RemindUsernameDeps,
): Promise<ApiHandlerResult> {
  const email = normalizeRemindEmail(pars.email);
  const now = deps.now?.() ?? Date.now();
  const day = startOfUtcDayIso(now);

  if (!email) {
    return {
      statusCode: 200,
      body: JSON.stringify(UNIFORM_BODY),
      headers,
    };
  }

  const emailPk = `REMINDUSER#email#${hashBucket(email)}#${day}`;
  const emailCount = await countRateEvents(deps.docClient, deps.tableName, emailPk);
  if (emailCount >= REMIND_USERNAME_EMAIL_DAILY_LIMIT) {
    return {
      statusCode: 200,
      body: JSON.stringify(UNIFORM_BODY),
      headers,
    };
  }

  const clientIp = typeof pars._clientIp === 'string' ? pars._clientIp.trim() : '';
  if (clientIp) {
    const ipPk = `REMINDUSER#ip#${hashBucket(clientIp)}#${day}`;
    const ipCount = await countRateEvents(deps.docClient, deps.tableName, ipPk);
    if (ipCount >= REMIND_USERNAME_IP_DAILY_LIMIT) {
      return {
        statusCode: 200,
        body: JSON.stringify(UNIFORM_BODY),
        headers,
      };
    }
  }

  const cognito = deps.cognito ?? new CognitoIdentityProviderClient({ region: 'us-east-1' });
  const matched = pickConfirmedUsersWithEmail(
    await listUsersByEmail(cognito, deps.userPoolId, email),
  );

  await recordRateEvent(
    deps.docClient,
    deps.tableName,
    emailPk,
    String(now),
  );
  if (clientIp) {
    await recordRateEvent(
      deps.docClient,
      deps.tableName,
      `REMINDUSER#ip#${hashBucket(clientIp)}#${day}`,
      `ip-${now}`,
    );
  }

  if (matched.length !== 1) {
    console.log('remind_username skip', { email, confirmedCount: matched.length });
    return {
      statusCode: 200,
      body: JSON.stringify(UNIFORM_BODY),
      headers,
    };
  }

  const user = matched[0]!;
  const loginName = user.Username?.trim();
  const destEmail = user.Attributes?.find((a) => a.Name === 'email')?.Value?.trim();
  if (!loginName || !destEmail) {
    return {
      statusCode: 200,
      body: JSON.stringify(UNIFORM_BODY),
      headers,
    };
  }

  const playBase = deps.playBaseUrl.replace(/\/$/, '');
  await initi18n('en');
  const loginUrl = `${playBase}/account/login`;
  const body = [
    i18n.t('RemindUsernameBody', { loginName }),
    '',
    i18n.t('RemindUsernameSignInLine'),
    loginUrl,
  ].join('\n');
  const subject = i18n.t('RemindUsernameSubject');
  try {
    await sendOutboundSes(sesClient, createSendEmailCommand(destEmail, loginName, subject, body));
    console.log('remind_username sent', { loginName, destEmail });
  } catch (err) {
    console.error('remind_username send failed', { err, loginName, destEmail });
  }

  return {
    statusCode: 200,
    body: JSON.stringify(UNIFORM_BODY),
    headers,
  };
}

export async function remindUsernameOpen(pars: RemindUsernamePars) {
  const { ddbDocClient } = await import('../ddb.js');
  return remindUsername(pars, {
    tableName: process.env.ABSTRACT_PLAY_TABLE!,
    userPoolId: process.env.userpoolId!,
    playBaseUrl: process.env.PLAY_BASE_URL ?? 'https://play.abstractplay.com',
    docClient: ddbDocClient,
  });
}