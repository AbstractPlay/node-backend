import { SendEmailCommand } from '@aws-sdk/client-ses';
import { applyGameslibBundlesTo } from '../gameslibLocales.js';
import i18n from '../i18nInstance.js';
import en from '../../locales/en/apback.json';
import fr from '../../locales/fr/apback.json';
import de from '../../locales/de/apback.json';
import it from '../../locales/it/apback.json';
import esUS from '../../locales/es-US/apback.json';
import pt from '../../locales/pt/apback.json';
import ta from '../../locales/ta/apback.json';

const LOCALE_RESOURCES = { en, fr, de, it, 'es-US': esUS, pt, ta } as const;
const REGISTERED_LANGUAGES = Object.keys(LOCALE_RESOURCES);

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

export async function changeLanguageForPlayer(player: { language: string | undefined }): Promise<void> {
  const lng = resolvePlayerLanguage(player.language);
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
}

export function createSendEmailCommand(toAddress: string, player: unknown, subject: unknown, body: string) {
  console.log('toAddress', toAddress, 'player', player, 'body', body);
  const fullbody = i18n.t('DearPlayer', { player }) + '\r\n\r\n' + body + '\r\n\r\n' + i18n.t('EmailOut');
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [toAddress],
    },
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: fullbody,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: String(subject),
      },
    },
    Source: 'abstractplay@mail.abstractplay.com',
  });
}

export async function initi18n(language: string): Promise<void> {
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    resources: Object.fromEntries(
      Object.entries(LOCALE_RESOURCES).map(([lng, translation]) => [lng, { translation }]),
    ),
  });

  applyGameslibBundlesTo(i18n);
}
