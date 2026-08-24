import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeDashboardPayload,
  buildMeProfilePayload,
  type MeAncillaryData,
} from '../lib/meQuery';

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
  palettes: [],
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
    ]);

    assert.equal(payload.id, 'u1');
    assert.deepEqual(payload.activeGames, [{ metaGame: 'saltire', id: 'g1' }]);
    assert.equal('games' in payload, false);
    assert.equal('challengesIssued' in payload, false);
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
    );

    assert.equal(payload.games.length, 1);
    assert.equal('activeGames' in payload, false);
    assert.equal(payload.challengesIssued.length, 1);
    assert.deepEqual(payload.notifications, []);
  });

  it('includes notifications when provided', () => {
    const payload = buildMeDashboardPayload(user, ancillary, [], {
      challengesIssued: [],
      challengesReceived: [],
      challengesAccepted: [],
      standingChallenges: [],
    }, [{
      sk: '1700000000000#abc',
      createdAt: 1700000000000,
      body: {
        type: 'challengeIssued',
        challengeId: 'c1',
        metaGame: 'go',
        challengerId: 'u2',
        challengerName: 'Bob',
      },
    }]);
    assert.equal(payload.notifications.length, 1);
    assert.equal(payload.notifications[0].body.type, 'challengeIssued');
  });

  it('does not include notifications on profile payload', () => {
    const payload = buildMeProfilePayload(user, ancillary, []);
    assert.equal('notifications' in payload, false);
  });
});
