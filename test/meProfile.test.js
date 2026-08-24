"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const meQuery_1 = require("../lib/meQuery");
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
const ancillary = {
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
(0, node_test_1.describe)('buildMeProfilePayload', () => {
    (0, node_test_1.it)('includes activeGames and omits games and challenges', () => {
        const payload = (0, meQuery_1.buildMeProfilePayload)(user, ancillary, [
            { metaGame: 'saltire', id: 'g1' },
        ]);
        strict_1.default.equal(payload.id, 'u1');
        strict_1.default.deepEqual(payload.activeGames, [{ metaGame: 'saltire', id: 'g1' }]);
        strict_1.default.equal('games' in payload, false);
        strict_1.default.equal('challengesIssued' in payload, false);
    });
});
(0, node_test_1.describe)('buildMeDashboardPayload', () => {
    (0, node_test_1.it)('includes games and challenges without activeGames', () => {
        const payload = (0, meQuery_1.buildMeDashboardPayload)(user, ancillary, [{
                id: 'g1',
                metaGame: 'saltire',
                players: [],
                clockHard: false,
                lastMoveTime: 1,
                toMove: '0',
            }], {
            challengesIssued: [{ id: 'c1' }],
            challengesReceived: [],
            challengesAccepted: [],
            standingChallenges: [],
        });
        strict_1.default.equal(payload.games.length, 1);
        strict_1.default.equal('activeGames' in payload, false);
        strict_1.default.equal(payload.challengesIssued.length, 1);
        strict_1.default.deepEqual(payload.notifications, []);
    });
    (0, node_test_1.it)('includes notifications when provided', () => {
        const payload = (0, meQuery_1.buildMeDashboardPayload)(user, ancillary, [], {
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
        strict_1.default.equal(payload.notifications.length, 1);
        strict_1.default.equal(payload.notifications[0].body.type, 'challengeIssued');
    });
    (0, node_test_1.it)('does not include notifications on profile payload', () => {
        const payload = (0, meQuery_1.buildMeProfilePayload)(user, ancillary, []);
        strict_1.default.equal('notifications' in payload, false);
    });
});
