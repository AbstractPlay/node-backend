"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const gameState_1 = require("../lib/gameState");
const playgroundSaves_1 = require("../lib/playgroundSaves");
const smallBody = JSON.stringify({ board: [[1, 2], [3, 4]] });
function largeBody() {
    const padding = 'x'.repeat(gameState_1.GAME_STATE_COMPRESS_THRESHOLD_BYTES);
    return JSON.stringify({ data: padding });
}
(0, node_test_1.test)('preparePlaygroundBodyForStorage leaves small body unchanged', () => {
    const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body: smallBody };
    const stored = (0, gameState_1.preparePlaygroundBodyForStorage)(record);
    strict_1.default.equal(stored.body, smallBody);
    strict_1.default.equal((0, gameState_1.isCompressedGameState)(stored.body), false);
});
(0, node_test_1.test)('preparePlaygroundBodyForStorage compresses large body with gz prefix', () => {
    const body = largeBody();
    const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body };
    const stored = (0, gameState_1.preparePlaygroundBodyForStorage)(record);
    strict_1.default.ok(stored.body.startsWith('gz:'));
    strict_1.default.ok(Buffer.byteLength(stored.body, 'utf8') < gameState_1.GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});
(0, node_test_1.test)('hydratePlaygroundBody round-trips large body', () => {
    const body = largeBody();
    const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body };
    const stored = (0, gameState_1.preparePlaygroundBodyForStorage)(record);
    const hydrated = (0, gameState_1.hydratePlaygroundBody)(stored);
    strict_1.default.equal(hydrated.body, body);
});
(0, node_test_1.test)('validatePlaygroundSaveInput accepts valid input', () => {
    const result = (0, playgroundSaves_1.validatePlaygroundSaveInput)({
        name: 'My save',
        metaGame: 'saltire',
        date: '2026-01-15T12:00:00.000Z',
        body: smallBody,
    });
    strict_1.default.equal(result.ok, true);
    if (result.ok) {
        strict_1.default.equal(result.data.name, 'My save');
        strict_1.default.equal(result.data.metaGame, 'saltire');
        strict_1.default.equal(result.data.date, new Date('2026-01-15T12:00:00.000Z').getTime());
        strict_1.default.equal(result.data.body, smallBody);
    }
});
(0, node_test_1.test)('validatePlaygroundSaveInput rejects empty name', () => {
    const result = (0, playgroundSaves_1.validatePlaygroundSaveInput)({
        name: '  ',
        metaGame: 'saltire',
        date: Date.now(),
        body: smallBody,
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /name/i);
    }
});
(0, node_test_1.test)('validatePlaygroundSaveInput rejects invalid JSON body', () => {
    const result = (0, playgroundSaves_1.validatePlaygroundSaveInput)({
        name: 'test',
        metaGame: 'saltire',
        date: Date.now(),
        body: 'not json',
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /JSON/i);
    }
});
(0, node_test_1.test)('validatePlaygroundSaveInput rejects invalid date', () => {
    const result = (0, playgroundSaves_1.validatePlaygroundSaveInput)({
        name: 'test',
        metaGame: 'saltire',
        date: 'not-a-date',
        body: smallBody,
    });
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /date/i);
    }
});
