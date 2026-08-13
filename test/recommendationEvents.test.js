"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const recommendationEvents_1 = require("../lib/recommendationEvents");
const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440000';
function itemKey(item) {
    return `${item.pk}:${item.sk}`;
}
function createMockDocClient(store) {
    return {
        async send(command) {
            if (command instanceof lib_dynamodb_1.PutCommand) {
                const item = command.input.Item;
                store.set(itemKey(item), { ...item });
                return {};
            }
            if (command instanceof lib_dynamodb_1.QueryCommand) {
                const pk = command.input.ExpressionAttributeValues[':pk'];
                const dayStart = command.input.ExpressionAttributeValues[':dayStart'];
                const items = [...store.values()].filter(item => {
                    if (item.pk !== pk) {
                        return false;
                    }
                    if (dayStart !== undefined) {
                        const skPrefix = String(item.sk).split('#')[0];
                        return Number(skPrefix) >= Number(dayStart);
                    }
                    return true;
                });
                if (command.input.Select === 'COUNT') {
                    return { Count: items.length };
                }
                return { Items: items };
            }
            throw new Error(`Unexpected command: ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.test)('recommendationEventsPk uses RECOMMENDS# prefix', () => {
    strict_1.default.equal((0, recommendationEvents_1.recommendationEventsPk)(USER_ID), `RECOMMENDS#${USER_ID}`);
});
(0, node_test_1.test)('validateRecommendationEventPars accepts rec_show payload', () => {
    const result = (0, recommendationEvents_1.validateRecommendationEventPars)({
        event: 'rec_show',
        batchId: BATCH_ID,
        surface: 'gamePicker',
        tier: 'warm',
        gameIds: ['go', 'amazons'],
        reasons: ['Similar to Go', 'Popular this week'],
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.event, 'rec_show');
        strict_1.default.deepEqual(result.data.gameIds, ['go', 'amazons']);
        strict_1.default.deepEqual(result.data.reasons, ['Similar to Go', 'Popular this week']);
        strict_1.default.ok(result.data.expiresAt > Math.floor(Date.now() / 1000));
    }
});
(0, node_test_1.test)('validateRecommendationEventPars accepts rec_click payload', () => {
    const result = (0, recommendationEvents_1.validateRecommendationEventPars)({
        event: 'rec_click',
        batchId: BATCH_ID,
        surface: 'gamePicker',
        tier: 'warm',
        metaGame: 'amazons',
        position: 2,
        reasonType: 'cooccur',
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.metaGame, 'amazons');
        strict_1.default.equal(result.data.position, 2);
        strict_1.default.equal(result.data.reasonType, 'cooccur');
    }
});
(0, node_test_1.test)('validateRecommendationEventPars rejects invalid event', () => {
    const result = (0, recommendationEvents_1.validateRecommendationEventPars)({
        event: 'rec_bad',
        batchId: BATCH_ID,
        surface: 'gamePicker',
        tier: 'warm',
    });
    strict_1.default.equal(result.ok, false);
});
(0, node_test_1.test)('logRecommendationEvent writes RECOMMENDS# partition key', async () => {
    const store = new Map();
    const client = createMockDocClient(store);
    const result = await (0, recommendationEvents_1.logRecommendationEvent)(client, TABLE, USER_ID, {
        event: 'rec_click',
        batchId: BATCH_ID,
        surface: 'gamePicker',
        tier: 'cold',
        metaGame: 'hex',
        position: 0,
        reasonType: 'popularity',
    });
    strict_1.default.equal(result.ok, true);
    const written = [...store.values()][0];
    strict_1.default.equal(written.pk, `RECOMMENDS#${USER_ID}`);
    strict_1.default.equal(written.event, 'rec_click');
    strict_1.default.equal(written.metaGame, 'hex');
    strict_1.default.ok(written.expiresAt > Math.floor(Date.now() / 1000));
});
(0, node_test_1.test)('logRecommendationEvent enforces daily rate limit', async () => {
    const store = new Map();
    const client = createMockDocClient(store);
    const dayStart = String(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    for (let i = 0; i < recommendationEvents_1.RECOMMENDATION_EVENTS_PER_DAY_LIMIT; i += 1) {
        store.set(`RECOMMENDS#${USER_ID}:${dayStart}#${i}`, {
            pk: `RECOMMENDS#${USER_ID}`,
            sk: `${dayStart}#${i}`,
        });
    }
    const result = await (0, recommendationEvents_1.logRecommendationEvent)(client, TABLE, USER_ID, {
        event: 'rec_challenge',
        batchId: BATCH_ID,
        surface: 'explore',
        tier: 'warm',
        metaGame: 'go',
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /rate limit/i);
    }
});
