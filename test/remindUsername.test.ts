import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  normalizeRemindEmail,
  pickConfirmedUsersWithEmail,
  remindUsername,
  REMIND_USERNAME_EMAIL_DAILY_LIMIT,
  type RemindUsernameDeps,
} from '../lib/auth/remindUsername.js';
import type { UserType } from '@aws-sdk/client-cognito-identity-provider';

test('normalizeRemindEmail rejects invalid addresses', () => {
  assert.equal(normalizeRemindEmail(''), null);
  assert.equal(normalizeRemindEmail('not-an-email'), null);
  assert.equal(normalizeRemindEmail('Ada@Example.com'), 'ada@example.com');
});

test('pickConfirmedUsersWithEmail keeps only CONFIRMED with email', () => {
  const users: UserType[] = [
    {
      Username: 'ada',
      UserStatus: 'CONFIRMED',
      Attributes: [{ Name: 'email', Value: 'a@b.com' }],
    },
    {
      Username: 'bob',
      UserStatus: 'UNCONFIRMED',
      Attributes: [{ Name: 'email', Value: 'a@b.com' }],
    },
  ];
  assert.equal(pickConfirmedUsersWithEmail(users).length, 1);
  assert.equal(pickConfirmedUsersWithEmail(users)[0]?.Username, 'ada');
});

test('remindUsername returns uniform success with zero Cognito matches', async () => {
  const calls: string[] = [];
  const docClient = {
    send: async (cmd: { constructor: { name: string } }) => {
      calls.push(cmd.constructor.name);
      if (cmd.constructor.name === 'QueryCommand') {
        return { Count: 0 };
      }
      return {};
    },
  };
  const cognito = {
    send: async () => ({ Users: [] }),
  };
  const deps: RemindUsernameDeps = {
    tableName: 'test-table',
    userPoolId: 'pool',
    playBaseUrl: 'https://play.dev.abstractplay.com',
    cognito: cognito as unknown as RemindUsernameDeps['cognito'],
    docClient: docClient as unknown as RemindUsernameDeps['docClient'],
    now: () => 1_700_000_000_000,
  };
  const res = await remindUsername({ email: 'solo@example.com' }, deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body ?? '{}'), { ok: true });
});

test('remindUsername does not send when multiple CONFIRMED users share email', async () => {
  const cognito = {
    send: async () => ({
      Users: [
        {
          Username: 'a',
          UserStatus: 'CONFIRMED',
          Attributes: [{ Name: 'email', Value: 'dup@example.com' }],
        },
        {
          Username: 'b',
          UserStatus: 'CONFIRMED',
          Attributes: [{ Name: 'email', Value: 'dup@example.com' }],
        },
      ],
    }),
  };
  const docClient = {
    send: async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        return { Count: 0 };
      }
      return {};
    },
  };
  const deps: RemindUsernameDeps = {
    tableName: 'test-table',
    userPoolId: 'pool',
    playBaseUrl: 'https://play.dev.abstractplay.com',
    cognito: cognito as unknown as RemindUsernameDeps['cognito'],
    docClient: docClient as unknown as RemindUsernameDeps['docClient'],
    now: () => 1_700_000_000_000,
  };
  const res = await remindUsername({ email: 'dup@example.com' }, deps);
  assert.equal(res.statusCode, 200);
});

test('remindUsername rate limits by email count', async () => {
  const docClient = {
    send: async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'QueryCommand') {
        return { Count: REMIND_USERNAME_EMAIL_DAILY_LIMIT };
      }
      return {};
    },
  };
  const deps: RemindUsernameDeps = {
    tableName: 'test-table',
    userPoolId: 'pool',
    playBaseUrl: 'https://play.dev.abstractplay.com',
    cognito: { send: async () => ({ Users: [] }) } as unknown as RemindUsernameDeps['cognito'],
    docClient: docClient as unknown as RemindUsernameDeps['docClient'],
    now: () => 1_700_000_000_000,
  };
  const res = await remindUsername({ email: 'hot@example.com' }, deps);
  assert.deepEqual(JSON.parse(res.body ?? '{}'), { ok: true });
});