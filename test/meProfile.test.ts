import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildMeDashboardPayload,
  buildMeProfilePayload,
  type MeAncillaryData,
} from '../lib/meQuery.js';
import { buildVacationSnapshot } from '../lib/vacation/resolve.js';

const vacation = buildVacationSnapshot({}, Date.parse('2026-06-15T12:00:00.000Z'));

const user = {
  id: 'u1',
  name: 'Alice',
  admin: false,
  organizer: false,
  language: 'en',
  country: 'US',
  settings: {},
  stars: ['saltire'],
  mayPush: true,
  publicRivalries: false,
};

const ancillary: MeAncillaryData = {
  tags: [],
  realStanding: [],
  customizations: {},
  bots: [],
  blocked: [],
  watchedGames: [],
  highlights: [],
  representatives: [],
};

describe('buildMeProfilePayload', () => {
  it('includes activeGames and omits games and challenges', () => {
    const payload = buildMeProfilePayload(user, ancillary, [
      { metaGame: 'saltire', id: 'g1' },
    ], vacation);

    assert.equal(payload.id, 'u1');
    assert.deepEqual(payload.activeGames, [{ metaGame: 'saltire', id: 'g1' }]);
    assert.equal('games' in payload, false);
    assert.equal('challengesIssued' in payload, false);
  });

  it('strips legacy color keys from settings', () => {
    const payload = buildMeProfilePayload(
      {
        ...user,
        settings: {
          all: { annotate: true, color: 'blind' },
          chess: { color: 'My Red', display: 'default' },
        },
      },
      ancillary,
      [],
      vacation,
    );
    assert.deepEqual(payload.settings, {
      all: { annotate: true },
      chess: { display: 'default' },
    });
    assert.equal('palettes' in payload, false);
  });
});

describe('buildMeDashboardPayload', () => {
  it('includes games and challenges without activeGames', () => {
    const payload = buildMeDashboardPayload(
      user,
      ancillary,
      [{
        id: 'g1',
        metaGame: 'saltire',
        players: [],
        clockHard: false,
        lastMoveTime: 1,
        toMove: '0',
      }],
      {
        challengesIssued: [{ id: 'c1' }],
        challengesReceived: [],
        challengesAccepted: [],
        standingChallenges: [],
      },
      vacation,
    );

    assert.equal(payload.games.length, 1);
    assert.equal('activeGames' in payload, false);
    assert.equal(payload.challengesIssued.length, 1);
    assert.equal('notifications' in payload, false);
  });

  it('does not include notifications on dashboard payload', () => {
    const payload = buildMeDashboardPayload(user, ancillary, [], {
      challengesIssued: [],
      challengesReceived: [],
      challengesAccepted: [],
      standingChallenges: [],
    }, vacation);
    assert.equal('notifications' in payload, false);
  });

  it('does not include notifications on profile payload', () => {
    const payload = buildMeProfilePayload(user, ancillary, [], vacation);
    assert.equal('notifications' in payload, false);
  });
});
