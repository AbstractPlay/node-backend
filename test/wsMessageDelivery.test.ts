import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { shouldDeliverWsMessage } from '../lib/wsMessageDelivery.js';
import type { WsConnectionItem } from '../lib/wsConnectionStore.js';

function conn(overrides: Partial<WsConnectionItem> = {}): WsConnectionItem {
  return {
    pk: 'wsConnections',
    sk: 'conn-1',
    connectionId: 'conn-1',
    userId: 'user-a',
    endpoint: 'https://example.com',
    ttl: Math.floor(Date.now() / 1000) + 3600,
    watchVersion: 1,
    watchingGames: new Set(['go#g1']),
    ...overrides,
  };
}

describe('shouldDeliverWsMessage', () => {
  it('delivers notification verb only to matching userId', () => {
    const a = conn({ userId: 'user-a' });
    const b = conn({ userId: 'user-b', sk: 'conn-2' });
    assert.equal(
      shouldDeliverWsMessage('notification', a, { userId: 'user-a' }),
      true,
    );
    assert.equal(
      shouldDeliverWsMessage('notification', b, { userId: 'user-a' }),
      false,
    );
  });

  it('does not deliver notification verb without userId in payload', () => {
    assert.equal(
      shouldDeliverWsMessage('notification', conn(), {}),
      false,
    );
  });

  it('delivers game verb when connection watches the game', () => {
    assert.equal(
      shouldDeliverWsMessage('game', conn(), { meta: 'go', id: 'g1' }),
      true,
    );
    assert.equal(
      shouldDeliverWsMessage('game', conn(), { meta: 'go', id: 'other' }),
      false,
    );
  });
});
