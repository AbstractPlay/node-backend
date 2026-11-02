import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { initi18n } from '../../lib/api/i18n.js';
import i18n from '../../lib/i18nInstance.js';
import {
  buildEventEndEmailBody,
  buildEventEndPushBody,
  winnerDisplayNamesForNotification,
} from '../../lib/events/eventEndMessage.js';

describe('eventEndMessage', () => {
  beforeAll(async () => {
    await initi18n('en');
    await i18n.changeLanguage('en');
  });

  it('buildEventEndEmailBody includes intro, winner, and event link', () => {
    const body = buildEventEndEmailBody({
      eventName: 'Spring Open',
      eventId: 'evt-1',
      recipientUserId: 'p2',
      winnerIds: ['p1'],
      winnerNames: ['Alice'],
    });
    assert.match(body, /Spring Open has ended/);
    assert.match(body, /Alice won the event/);
    assert.match(body, /https:\/\/play\.abstractplay\.com\/event\/evt-1/);
  });

  it('personalizes winner line for the recipient', () => {
    const body = buildEventEndPushBody({
      eventName: 'Cup',
      eventId: 'evt-2',
      recipientUserId: 'p1',
      winnerIds: ['p1'],
      winnerNames: ['Alice'],
    });
    assert.match(body, /You won the event!/);
  });

  it('maps winner display names from player records', () => {
    const map = new Map([
      ['a', { id: 'a', name: 'Alice' }],
      ['b', { id: 'b', name: 'Bob' }],
    ]);
    assert.deepEqual(
      winnerDisplayNamesForNotification(['a', 'missing', 'b'], map),
      ['Alice', 'Bob'],
    );
  });
});
