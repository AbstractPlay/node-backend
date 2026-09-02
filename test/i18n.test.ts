import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import i18n from 'i18next';
import { gameinfo } from '@abstractplay/gameslib';
import { localizedGameName } from '../lib/gameDisplayName';
import { changeLanguageForPlayer, initi18n } from '../api/abstractplay';

beforeEach(async () => {
  if (i18n.isInitialized) {
    await i18n.changeLanguage('en');
  }
  await initi18n('en');
});

test('initi18n loads apgames bundles for managed languages', async () => {
  assert.ok(i18n.hasResourceBundle('de', 'apgames'));
  assert.ok(i18n.hasResourceBundle('en', 'apgames'));
});

test('localizedGameName resolves via active language after changeLanguageForPlayer', async () => {
  const uid = 'hex';
  const fallback = gameinfo.get(uid)?.name ?? uid;
  await changeLanguageForPlayer({ language: 'en' });
  assert.equal(localizedGameName(uid), fallback);
  await changeLanguageForPlayer({ language: 'de' });
  assert.equal(typeof localizedGameName(uid), 'string');
  assert.ok(localizedGameName(uid).length > 0);
});

test('changeLanguageForPlayer uses German when registered', async () => {
  await changeLanguageForPlayer({ language: 'de' });
  assert.equal(i18n.language, 'de');
  assert.match(i18n.t('ChallengeSubject'), /Neue Herausforderung/);
});

test('changeLanguageForPlayer maps es to es-US', async () => {
  const player = { language: 'es' };
  await changeLanguageForPlayer(player);
  assert.equal(i18n.language, 'es-US');
  assert.equal(player.language, 'es');
  assert.equal(i18n.t('ChallengeSubject'), 'AbstractPlay: nuevo desafío');
});

test('changeLanguageForPlayer falls back to English for unregistered languages', async () => {
  const player = { language: 'ja' };
  await changeLanguageForPlayer(player);
  assert.equal(i18n.language, 'en');
  assert.equal(player.language, 'ja');
  assert.equal(i18n.t('ChallengeSubject'), 'AbstractPlay: new challenge');
});

test('YourMoveBatchedBody pluralizes by count', async () => {
  await changeLanguageForPlayer({ language: 'en' });
  assert.match(i18n.t('YourMoveBatchedBody', { count: 1 }), /1 game/);
  assert.match(i18n.t('YourMoveBatchedBody', { count: 3 }), /3 games/);
});
