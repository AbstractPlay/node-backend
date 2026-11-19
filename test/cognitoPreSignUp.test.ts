import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applyPreSignUpChecks,
  emailsMatchForSignUp,
  MIN_REGISTER_MS,
  normalizeEmailAddress,
  PreSignUpRejected,
  type PreSignUpTriggerEvent,
} from '../lib/cognito/preSignUp.js';

function baseEvent(overrides: Partial<PreSignUpTriggerEvent> = {}): PreSignUpTriggerEvent {
  const now = Date.now();
  return {
    triggerSource: 'PreSignUp_SignUp',
    userName: 'ada',
    request: {
      userAttributes: { email: 'ada@example.com' },
      clientMetadata: {
        website: '',
        emailConfirm: 'ada@example.com',
        formStartedAt: String(now - MIN_REGISTER_MS - 100),
      },
    },
    ...overrides,
  };
}

test('normalizeEmailAddress lowercases domain only', () => {
  assert.equal(normalizeEmailAddress('  Ada@Gmail.COM '), 'Ada@gmail.com');
});

test('emailsMatchForSignUp is case-insensitive', () => {
  assert.equal(emailsMatchForSignUp('Ada@Gmail.com', 'ada@gmail.com'), true);
  assert.equal(emailsMatchForSignUp('user+tag@proton.me', 'user+tag@proton.me'), true);
});

test('allows proton and gmail plus addressing', async () => {
  await applyPreSignUpChecks(baseEvent({
    request: {
      userAttributes: { email: 'user+alias@gmail.com' },
      clientMetadata: {
        website: '',
        emailConfirm: 'user+alias@gmail.com',
        formStartedAt: String(Date.now() - 5000),
      },
    },
  }));
  await applyPreSignUpChecks(baseEvent({
    request: {
      userAttributes: { email: 'alias@proton.me' },
      clientMetadata: {
        website: '',
        emailConfirm: 'alias@proton.me',
        formStartedAt: String(Date.now() - 5000),
      },
    },
  }));
});

test('rejects throwaway domain mailinator', async () => {
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({
      request: {
        userAttributes: { email: 'bot@mailinator.com' },
        clientMetadata: {
          website: '',
          emailConfirm: 'bot@mailinator.com',
          formStartedAt: String(Date.now() - 5000),
        },
      },
    })),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'EmailNotAllowed',
  );
});

test('honeypot absent or filled denies', async () => {
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({
      request: {
        userAttributes: { email: 'ada@example.com' },
        clientMetadata: {
          emailConfirm: 'ada@example.com',
          formStartedAt: String(Date.now() - 5000),
        },
      },
    })),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'Honeypot',
  );
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({
      request: {
        userAttributes: { email: 'ada@example.com' },
        clientMetadata: {
          website: 'https://spam.example',
          emailConfirm: 'ada@example.com',
          formStartedAt: String(Date.now() - 5000),
        },
      },
    })),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'Honeypot',
  );
});

test('emailConfirm mismatch denies', async () => {
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({
      request: {
        userAttributes: { email: 'ada@example.com' },
        clientMetadata: {
          website: '',
          emailConfirm: 'ada@example.org',
          formStartedAt: String(Date.now() - 5000),
        },
      },
    })),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'EmailConfirm',
  );
});

test('timing too fast denies', async () => {
  const now = 1_700_000_000_000;
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({
      request: {
        userAttributes: { email: 'ada@example.com' },
        clientMetadata: {
          website: '',
          emailConfirm: 'ada@example.com',
          formStartedAt: String(now - 500),
        },
      },
    }), { now: () => now }),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'Timing',
  );
});

test('admin create user skips clientMetadata checks', async () => {
  await applyPreSignUpChecks(baseEvent({
    triggerSource: 'PreSignUp_AdminCreateUser',
    request: {
      userAttributes: { email: 'invited@example.com' },
    },
  }));
});

test('reserved username denies', async () => {
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent({ userName: 'admin' })),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'ReservedUsername',
  );
});

test('duplicate email denies when lookup finds user', async () => {
  await assert.rejects(
    () => applyPreSignUpChecks(baseEvent(), {
      emailInUse: async () => true,
    }),
    (err: unknown) => err instanceof PreSignUpRejected && err.code === 'DuplicateEmail',
  );
});

test('email as login name allowed', async () => {
  await applyPreSignUpChecks(baseEvent({
    userName: 'player@gmail.com',
    request: {
      userAttributes: { email: 'player@gmail.com' },
      clientMetadata: {
        website: '',
        emailConfirm: 'player@gmail.com',
        formStartedAt: String(Date.now() - 5000),
      },
    },
  }));
});