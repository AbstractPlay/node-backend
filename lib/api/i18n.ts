import { SendEmailCommand } from '@aws-sdk/client-ses';
import {
  changeLanguageForPlayer,
  initApbackI18n,
  resolvePlayerLanguage,
} from '../apbackI18n.js';
import i18n from '../i18nInstance.js';

export { changeLanguageForPlayer, resolvePlayerLanguage };

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
  await initApbackI18n(language);
}
