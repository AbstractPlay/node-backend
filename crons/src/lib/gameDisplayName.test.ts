import { beforeEach, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { gameinfo } from '@abstractplay/gameslib';
import { localizedGameName } from './gameDisplayName.js';
import { changeLanguageForPlayer, initApbackI18n } from './apbackI18n.js';

describe('tournament email i18n', () => {
  beforeEach(async () => {
    if (i18n.isInitialized) {
      await i18n.changeLanguage('en');
    }
    await initApbackI18n('en');
  });

  it('loads apgames bundles for managed languages', () => {
    expect(i18n.hasResourceBundle('de', 'apgames')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'apgames')).toBe(true);
  });

  it('localizedGameName resolves after changeLanguageForPlayer', async () => {
    const uid = 'hex';
    const fallback = gameinfo.get(uid)?.name ?? uid;
    await changeLanguageForPlayer({ language: 'en' });
    expect(localizedGameName(uid)).toBe(fallback);
    await changeLanguageForPlayer({ language: 'de' });
    expect(localizedGameName(uid).length).toBeGreaterThan(0);
  });

  it('maps es player language to es-US', async () => {
    await changeLanguageForPlayer({ language: 'es' });
    expect(i18n.language).toBe('es-US');
  });
});
