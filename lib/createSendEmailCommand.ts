import { SendEmailCommand } from '@aws-sdk/client-ses';
import i18n from './i18nInstance.js';
import { SES_FROM_ADDRESS } from './sesFromAddress.js';

export function createSendEmailCommand(
  toAddress: string,
  player: unknown,
  subject: unknown,
  body: string,
) {
  console.log('toAddress', toAddress, 'player', player, 'body', body);
  const fullbody =
    i18n.t('DearPlayer', { player }) +
    '\r\n\r\n' +
    body +
    '\r\n\r\n' +
    i18n.t('EmailOut');
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
    Source: SES_FROM_ADDRESS,
  });
}