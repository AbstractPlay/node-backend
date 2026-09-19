import i18n from 'i18next';
import { applyGameslibBundlesTo, GAMESLIB_APGAMES_LANGS } from './gameslibLocales.js';
import en from '../locales/en/apback.json';
import fr from '../locales/fr/apback.json';
import de from '../locales/de/apback.json';
import it from '../locales/it/apback.json';
import esUS from '../locales/es-US/apback.json';
import pt from '../locales/pt/apback.json';
import ta from '../locales/ta/apback.json';

const LOCALE_RESOURCES = { en, fr, de, it, 'es-US': esUS, pt, ta } as const;
const REGISTERED_LANGUAGES = [
  ...new Set([...Object.keys(LOCALE_RESOURCES), ...GAMESLIB_APGAMES_LANGS]),
];

export function resolvePlayerLanguage(language: string | undefined): string {
  if (language && REGISTERED_LANGUAGES.includes(language)) {
    return language;
  }
  if (language) {
    const lower = language.toLowerCase();
    if (lower === 'es' || lower.startsWith('es-')) {
      return 'es-US';
    }
  }
  return 'en';
}

export async function changeLanguageForPlayer(player: {
  language: string | undefined;
}): Promise<void> {
  const lng = resolvePlayerLanguage(player.language);
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
}

/** Init i18next with vendored apback + gameslib locale bundles (email/push copy). */
export async function initApbackI18n(language = 'en'): Promise<void> {
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    resources: Object.fromEntries(
      REGISTERED_LANGUAGES.map((lng) => [
        lng,
        {
          ...(lng in LOCALE_RESOURCES
            ? { translation: LOCALE_RESOURCES[lng as keyof typeof LOCALE_RESOURCES] }
            : {}),
        },
      ]),
    ),
  });
  applyGameslibBundlesTo(i18n);
}

/** @deprecated Use initApbackI18n */
export const initi18n = initApbackI18n;
