"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const zlib_1 = require("zlib");
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const gameState_1 = require("../lib/gameState");
let GameFactory;
(0, node_test_1.before)(async () => {
    ({ GameFactory } = await Promise.resolve().then(() => __importStar(require('@abstractplay/gameslib'))));
});
function loadFixture(name) {
    return (0, fs_1.readFileSync)((0, path_1.join)(__dirname, 'fixtures', name), 'utf8').trim();
}
const saltireState = loadFixture('saltire-state.json');
const storisendeRaw = loadFixture('storisende-raw.json');
const storisendeGz = loadFixture('storisende-gz.txt');
(0, node_test_1.test)('large saltire fixture exceeds compression threshold', () => {
    strict_1.default.ok(Buffer.byteLength(saltireState, 'utf8') > gameState_1.GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});
(0, node_test_1.test)('large storisende raw fixture exceeds compression threshold', () => {
    strict_1.default.ok(Buffer.byteLength(storisendeRaw, 'utf8') > gameState_1.GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});
(0, node_test_1.test)('compresses large state with gz prefix', () => {
    const compressed = (0, gameState_1.compressGameStateIfNeeded)(saltireState);
    strict_1.default.ok(compressed.startsWith('gz:'));
    strict_1.default.ok(Buffer.byteLength(compressed, 'utf8') < gameState_1.GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});
(0, node_test_1.test)('round-trip preserves large state', () => {
    const compressed = (0, gameState_1.compressGameStateIfNeeded)(saltireState);
    const restored = (0, gameState_1.decompressGameState)(compressed);
    strict_1.default.equal(restored, saltireState);
});
(0, node_test_1.test)('GameFactory accepts decompressed saltire state', () => {
    const restored = (0, gameState_1.decompressGameState)((0, gameState_1.compressGameStateIfNeeded)(saltireState));
    const engine = GameFactory('saltire', restored);
    strict_1.default.ok(engine);
    strict_1.default.equal(engine.gameover, true);
    strict_1.default.deepEqual(engine.winner, [2]);
});
(0, node_test_1.test)('small state is not compressed', () => {
    const small = '{"game":"saltire","numplayers":2}';
    strict_1.default.equal((0, gameState_1.compressGameStateIfNeeded)(small), small);
    strict_1.default.equal((0, gameState_1.isCompressedGameState)(small), false);
});
(0, node_test_1.test)('legacy gameslib storisende gzip decompresses to raw state', () => {
    strict_1.default.equal((0, gameState_1.isCompressedGameState)(storisendeGz), true);
    strict_1.default.equal((0, gameState_1.decompressGameState)(storisendeGz), storisendeRaw);
});
(0, node_test_1.test)('GameFactory accepts gameslib-compressed storisende state after hydration', () => {
    const engine = GameFactory('storisende', (0, gameState_1.decompressGameState)(storisendeGz));
    strict_1.default.ok(engine);
    strict_1.default.equal(engine.gameover, true);
});
(0, node_test_1.test)('legacy base64 gzip without prefix decompresses', () => {
    const legacy = (0, zlib_1.gzipSync)(Buffer.from(saltireState, 'utf8')).toString('base64');
    strict_1.default.equal((0, gameState_1.isCompressedGameState)(legacy), true);
    strict_1.default.equal((0, gameState_1.decompressGameState)(legacy), saltireState);
});
(0, node_test_1.test)('does not double-compress gz or legacy formats', () => {
    const compressed = (0, gameState_1.compressGameStateIfNeeded)(saltireState);
    strict_1.default.equal((0, gameState_1.compressGameStateIfNeeded)(compressed), compressed);
    strict_1.default.equal((0, gameState_1.compressGameStateIfNeeded)(storisendeGz), storisendeGz);
});
(0, node_test_1.test)('backend re-compresses large raw storisende on storage', () => {
    const stored = (0, gameState_1.compressGameStateIfNeeded)(storisendeRaw);
    strict_1.default.ok(stored.startsWith('gz:'));
    strict_1.default.equal((0, gameState_1.decompressGameState)(stored), storisendeRaw);
});
(0, node_test_1.test)('prepareGameStateForStorage compresses state only', () => {
    const record = {
        pk: 'GAME',
        sk: 'saltire#1#test',
        id: 'test',
        state: saltireState,
        metaGame: 'saltire',
    };
    const stored = (0, gameState_1.prepareGameStateForStorage)(record);
    strict_1.default.notEqual(stored, record);
    strict_1.default.ok(stored.state.startsWith('gz:'));
    strict_1.default.equal(stored.pk, 'GAME');
    strict_1.default.equal(stored.id, 'test');
});
(0, node_test_1.test)('hydrateGameState decompresses gameslib legacy state', () => {
    const record = { pk: 'GAME', sk: 'storisende#0#test', state: storisendeGz };
    const hydrated = (0, gameState_1.hydrateGameState)(record);
    strict_1.default.notEqual(hydrated, record);
    strict_1.default.equal(hydrated.state, storisendeRaw);
    strict_1.default.equal(hydrated.pk, 'GAME');
});
(0, node_test_1.test)('hydrateGameState decompresses backend gz state', () => {
    const stored = (0, gameState_1.prepareGameStateForStorage)({ pk: 'GAME', state: saltireState });
    const hydrated = (0, gameState_1.hydrateGameState)(stored);
    strict_1.default.notEqual(hydrated, stored);
    strict_1.default.equal(hydrated.state, saltireState);
    strict_1.default.equal(hydrated.pk, 'GAME');
});
(0, node_test_1.test)('setGameEndedFromEngine sets gameEnded and winner when game is over', () => {
    const engine = GameFactory('saltire', saltireState);
    strict_1.default.ok(engine);
    const game = {};
    (0, gameState_1.setGameEndedFromEngine)(game, engine);
    strict_1.default.equal(game.gameEnded, new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime());
    strict_1.default.deepEqual(game.winner, engine.winner);
    strict_1.default.equal(game.gameStarted, new Date(engine.stack[0]._timestamp).getTime());
});
(0, node_test_1.test)('setGameEndedFromEngine is a no-op for in-progress games', () => {
    const engine = {
        gameover: false,
        winner: [1],
        stack: [{ _timestamp: '2020-01-01T00:00:00.000Z' }],
    };
    const game = {};
    (0, gameState_1.setGameEndedFromEngine)(game, engine);
    strict_1.default.equal(game.gameEnded, undefined);
    strict_1.default.equal(game.winner, undefined);
});
(0, node_test_1.test)('setGameEndedFromEngine preserves existing gameStarted', () => {
    const engine = GameFactory('saltire', saltireState);
    strict_1.default.ok(engine);
    const game = { gameStarted: 42 };
    (0, gameState_1.setGameEndedFromEngine)(game, engine);
    strict_1.default.equal(game.gameStarted, 42);
});
