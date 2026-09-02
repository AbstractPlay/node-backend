"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const i18next_1 = __importDefault(require("i18next"));
const gameslib_1 = require("@abstractplay/gameslib");
const gameDisplayName_1 = require("../lib/gameDisplayName");
const abstractplay_1 = require("../api/abstractplay");
(0, node_test_1.beforeEach)(async () => {
    if (i18next_1.default.isInitialized) {
        await i18next_1.default.changeLanguage('en');
    }
    await (0, abstractplay_1.initi18n)('en');
});
(0, node_test_1.test)('initi18n loads apgames bundles for managed languages', async () => {
    strict_1.default.ok(i18next_1.default.hasResourceBundle('de', 'apgames'));
    strict_1.default.ok(i18next_1.default.hasResourceBundle('en', 'apgames'));
});
(0, node_test_1.test)('localizedGameName resolves via active language after changeLanguageForPlayer', async () => {
    const uid = 'hex';
    const fallback = gameslib_1.gameinfo.get(uid)?.name ?? uid;
    await (0, abstractplay_1.changeLanguageForPlayer)({ language: 'en' });
    strict_1.default.equal((0, gameDisplayName_1.localizedGameName)(uid), fallback);
    await (0, abstractplay_1.changeLanguageForPlayer)({ language: 'de' });
    strict_1.default.equal(typeof (0, gameDisplayName_1.localizedGameName)(uid), 'string');
    strict_1.default.ok((0, gameDisplayName_1.localizedGameName)(uid).length > 0);
});
(0, node_test_1.test)('changeLanguageForPlayer uses German when registered', async () => {
    await (0, abstractplay_1.changeLanguageForPlayer)({ language: 'de' });
    strict_1.default.equal(i18next_1.default.language, 'de');
    strict_1.default.match(i18next_1.default.t('ChallengeSubject'), /Neue Herausforderung/);
});
(0, node_test_1.test)('changeLanguageForPlayer maps es to es-US', async () => {
    const player = { language: 'es' };
    await (0, abstractplay_1.changeLanguageForPlayer)(player);
    strict_1.default.equal(i18next_1.default.language, 'es-US');
    strict_1.default.equal(player.language, 'es');
    strict_1.default.equal(i18next_1.default.t('ChallengeSubject'), 'AbstractPlay: nuevo desafío');
});
(0, node_test_1.test)('changeLanguageForPlayer falls back to English for unregistered languages', async () => {
    const player = { language: 'ja' };
    await (0, abstractplay_1.changeLanguageForPlayer)(player);
    strict_1.default.equal(i18next_1.default.language, 'en');
    strict_1.default.equal(player.language, 'ja');
    strict_1.default.equal(i18next_1.default.t('ChallengeSubject'), 'AbstractPlay: new challenge');
});
(0, node_test_1.test)('YourMoveBatchedBody pluralizes by count', async () => {
    await (0, abstractplay_1.changeLanguageForPlayer)({ language: 'en' });
    strict_1.default.match(i18next_1.default.t('YourMoveBatchedBody', { count: 1 }), /1 game/);
    strict_1.default.match(i18next_1.default.t('YourMoveBatchedBody', { count: 3 }), /3 games/);
});
