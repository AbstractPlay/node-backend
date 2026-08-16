"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const layoutFeedbackEvents_1 = require("../lib/layoutFeedbackEvents");
const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
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
            throw new Error(`Unexpected command: ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.test)('layoutFeedbackEventsPk uses LAYOUTFB# prefix', () => {
    strict_1.default.equal((0, layoutFeedbackEvents_1.layoutFeedbackEventsPk)(USER_ID), `LAYOUTFB#${USER_ID}`);
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars accepts session_start', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'session_start',
        layoutId: 'card',
        gameId: 'game-1',
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.event, 'session_start');
        strict_1.default.equal(result.data.layoutId, 'card');
        strict_1.default.equal(result.data.gameId, 'game-1');
    }
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars accepts feedback with rating', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'feedback',
        layoutId: 'strip',
        rating: 'up',
        durationMs: 12000,
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.rating, 'up');
        strict_1.default.equal(result.data.durationMs, 12000);
    }
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars accepts feedback_note with comment', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'feedback_note',
        layoutId: 'narrative',
        comment: '  Hard to find submit  ',
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.comment, 'Hard to find submit');
    }
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars rejects empty feedback_note comment', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'feedback_note',
        layoutId: 'card',
        comment: '   ',
    });
    strict_1.default.equal(result.ok, false);
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars rejects comment over max length', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'feedback_note',
        layoutId: 'card',
        comment: 'x'.repeat(layoutFeedbackEvents_1.LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH + 1),
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /500/);
    }
});
(0, node_test_1.test)('validateLayoutFeedbackEventPars accepts layout_switch', () => {
    const result = (0, layoutFeedbackEvents_1.validateLayoutFeedbackEventPars)({
        event: 'layout_switch',
        layoutId: 'strip',
        toLayoutId: 'card',
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.toLayoutId, 'card');
    }
});
(0, node_test_1.test)('logLayoutFeedbackEvent writes LAYOUTFB# partition key without expiresAt', async () => {
    const store = new Map();
    const client = createMockDocClient(store);
    const result = await (0, layoutFeedbackEvents_1.logLayoutFeedbackEvent)(client, TABLE, USER_ID, {
        event: 'feedback',
        layoutId: 'card',
        rating: 'down',
    });
    strict_1.default.equal(result.ok, true);
    const written = [...store.values()][0];
    strict_1.default.equal(written.pk, `LAYOUTFB#${USER_ID}`);
    strict_1.default.equal(written.event, 'feedback');
    strict_1.default.equal(written.rating, 'down');
    strict_1.default.equal(written.expiresAt, undefined);
});
