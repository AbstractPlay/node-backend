import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import i18n from 'i18next';
import { changeLanguageForPlayer, initi18n } from '../api/abstractplay';

beforeEach(async () => {
  if (i18n.isInitialized) {
    await i18n.changeLanguage('en');
  }
  await initi18n('en');
});

test('changeLanguageForPlayer uses German when registered', async () => {
  await changeLanguageForPlayer({ language: 'de' });
  assert.equal(i18n.language, 'de');
  assert.match(i18n.t('ChallengeSubject'), /Neue Herausforderung/);
});

test('changeLanguageForPlayer falls back to English for unregistered languages', async () => {
  const player = { language: 'es' };
  await changeLanguageForPlayer(player);
  assert.equal(i18n.language, 'en');
  assert.equal(player.language, 'es');
  assert.equal(i18n.t('ChallengeSubject'), 'AbstractPlay: new challenge');
});

test('YourMoveBatchedBody pluralizes by count', async () => {
  await changeLanguageForPlayer({ language: 'en' });
  assert.match(i18n.t('YourMoveBatchedBody', { count: 1 }), /1 game/);
  assert.match(i18n.t('YourMoveBatchedBody', { count: 3 }), /3 games/);
});
