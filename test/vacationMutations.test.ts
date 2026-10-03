import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { VACATION_QUOTA_MS } from '../lib/vacation/constants.js';
import {
  scheduleVacation,
  stopVacation,
  updateVacation,
} from '../lib/vacation/mutations.js';

const TABLE = 'test-table';
const USER = 'user-1';
const T0 = Date.parse('2026-06-15T12:00:00.000Z');
const HOUR = 3_600_000;

function userKey() {
  return `${USER}:USER`;
}

type StoreItem = Record<string, unknown> & { pk: string; sk: string };

function createMockDocClient(store: Map<string, StoreItem>) {
  return {
    async send(command: unknown) {
      if (command instanceof GetCommand) {
        const key = `${command.input.Key!.sk}:${command.input.Key!.pk}`;
        const item = store.get(key);
        return { Item: item ? { ...item } : undefined };
      }
      if (command instanceof UpdateCommand) {
        const key = `${command.input.Key!.sk}:${command.input.Key!.pk}`;
        const item = store.get(key);
        if (!item) {
          throw new Error('missing item');
        }
        const condition = command.input.ConditionExpression;
        const values = command.input.ExpressionAttributeValues ?? {};
        if (condition === 'attribute_not_exists(vacationStartsAt)' && item.vacationStartsAt !== undefined) {
          const err = new Error('conditional failed');
          (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }
        if (condition === 'vacationStartsAt = :startsAt' && item.vacationStartsAt !== values[':startsAt']) {
          const err = new Error('conditional failed');
          (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }
        if (condition === 'vacationStartsAt = :expectedStartsAt' && item.vacationStartsAt !== values[':expectedStartsAt']) {
          const err = new Error('conditional failed');
          (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }

        const expr = command.input.UpdateExpression ?? '';
        if (expr.includes('SET')) {
          for (const [k, v] of Object.entries(values)) {
            if (!k.startsWith(':') || k === ':startsAt' || k === ':expectedStartsAt') {
              continue;
            }
            const field = k === ':openEnded'
              ? 'vacationOpenEnded'
              : k === ':endsAt'
                ? 'vacationEndsAt'
                : k === ':stintStart'
                  ? 'vacationStintStartedAt'
                  : k === ':used'
                    ? 'vacationPauseMsUsed'
                    : k === ':year'
                      ? 'vacationQuotaYear'
                      : k === ':true'
                        ? 'onVacation'
                        : null;
            if (field) {
              item[field] = v;
            }
          }
          if (values[':startsAt'] !== undefined && expr.includes('vacationStartsAt =')) {
            item.vacationStartsAt = values[':startsAt'];
          }
        }
        if (expr.includes('REMOVE')) {
          const removePart = expr.split('REMOVE')[1] ?? '';
          for (const name of removePart.split(',').map(s => s.trim())) {
            delete item[name];
          }
        }
        store.set(key, item);
        return {};
      }
      throw new Error(`Unexpected ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

function seedUser(store: Map<string, StoreItem>, vacation: Record<string, unknown> = {}) {
  store.set(userKey(), {
    pk: 'USER',
    sk: USER,
    vacationQuotaYear: 2026,
    vacationPauseMsUsed: 0,
    ...vacation,
  });
  store.set(`${USER}:USERS`, { pk: 'USERS', sk: USER });
}

describe('vacation mutations', () => {
  it('schedules future fixed stint without stintStartedAt', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store);
    const client = createMockDocClient(store);
    const result = await scheduleVacation(
      client,
      TABLE,
      USER,
      {
        startsAt: T0 + 2 * HOUR,
        endsAt: T0 + 10 * HOUR,
        openEnded: false,
      },
      T0,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vacation.vacationScheduled, true);
      assert.equal(result.vacation.vacationActive, false);
    }
    const item = store.get(userKey())!;
    assert.equal(item.vacationStartsAt, T0 + 2 * HOUR);
    assert.equal(item.vacationEndsAt, T0 + 10 * HOUR);
    assert.equal(item.vacationStintStartedAt, undefined);
  });

  it('schedules immediate open-ended stint with stintStartedAt', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store);
    const client = createMockDocClient(store);
    const result = await scheduleVacation(
      client,
      TABLE,
      USER,
      { startsAt: T0, openEnded: true },
      T0,
    );
    assert.equal(result.ok, true);
    const item = store.get(userKey())!;
    assert.equal(item.vacationStintStartedAt, T0);
    assert.equal(item.vacationOpenEnded, true);
    assert.equal(item.vacationEndsAt, undefined);
  });

  it('cancels scheduled stint without charging quota', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store, {
      vacationStartsAt: T0 + HOUR,
      vacationOpenEnded: true,
    });
    const client = createMockDocClient(store);
    const result = await stopVacation(client, TABLE, USER, T0);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vacation.vacationScheduled, false);
      assert.equal(result.vacation.vacationPauseMsUsed, 0);
    }
    const item = store.get(userKey())!;
    assert.equal(item.vacationStartsAt, undefined);
  });

  it('stops active stint and charges pause ms to quota', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store, {
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationOpenEnded: true,
    });
    const client = createMockDocClient(store);
    const result = await stopVacation(client, TABLE, USER, T0 + 3 * HOUR);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vacation.vacationActive, false);
      assert.equal(result.vacation.vacationPauseMsUsed, 3 * HOUR);
    }
    const item = store.get(userKey())!;
    assert.equal(item.vacationStartsAt, undefined);
    assert.equal(item.vacationPauseMsUsed, 3 * HOUR);
    assert.equal(item.vacationQuotaYear, 2026);
  });

  it('updates scheduled end before start', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store, {
      vacationStartsAt: T0 + 2 * HOUR,
      vacationEndsAt: T0 + 8 * HOUR,
      vacationOpenEnded: false,
    });
    const client = createMockDocClient(store);
    const result = await updateVacation(
      client,
      TABLE,
      USER,
      { endsAt: T0 + 12 * HOUR },
      T0,
    );
    assert.equal(result.ok, true);
    const item = store.get(userKey())!;
    assert.equal(item.vacationEndsAt, T0 + 12 * HOUR);
  });

  it('rejects schedule when stint already exists', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store, { vacationStartsAt: T0 + HOUR, vacationOpenEnded: true });
    const client = createMockDocClient(store);
    const result = await scheduleVacation(
      client,
      TABLE,
      USER,
      { startsAt: T0 + 5 * HOUR, openEnded: true },
      T0,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'vacation_stint_active');
    }
  });

  it('rejects schedule when fixed stint exceeds quota', async () => {
    const store = new Map<string, StoreItem>();
    seedUser(store, {
      vacationQuotaYear: 2026,
      vacationPauseMsUsed: VACATION_QUOTA_MS - HOUR,
    });
    const client = createMockDocClient(store);
    const result = await scheduleVacation(
      client,
      TABLE,
      USER,
      {
        startsAt: T0,
        endsAt: T0 + 3 * HOUR,
        openEnded: false,
      },
      T0,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'vacation_no_quota');
    }
  });
});
