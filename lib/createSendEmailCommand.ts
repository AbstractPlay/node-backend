import { SendEmailCommand } from '@aws-sdk/client-ses';
import type { OutboundSesCommand } from './sesOutbound.js';
import i18n from './i18nInstance.js';
import { SES_FROM_ADDRESS } from './sesFromAddress.js';
import {
  buildEmailUnsubscribeOneClickUrl,
  buildEmailUnsubscribeUrl,
  signEmailUnsubscribeToken,
} from './emailUnsubscribeToken.js';
import { createSendRawEmailCommand } from './sesNotificationEmail.js';

export type CreateSendEmailOptions = {
  userId: string;
};

type UnsubscribeLinks = {
  playUrl: string;
  oneClickUrl: string;
};

function buildUnsubscribeLinks(
  toAddress: string,
  userId: string,
): UnsubscribeLinks | undefined {
  const token = signEmailUnsubscribeToken(userId, toAddress);
  if (!token) {
    return undefined;
  }
  const playUrl = buildEmailUnsubscribeUrl(token);
  const oneClickUrl = buildEmailUnsubscribeOneClickUrl(token);
  if (!playUrl || !oneClickUrl) {
    return undefined;
  }
  return { playUrl, oneClickUrl };
}

function appendUnsubscribeFooter(fullbody: string, playUrl: string): string {
  const footer = [
    '',
    '---',
    i18n.t('EmailUnsubscribeFooter'),
    playUrl,
  ].join('\r\n');
  return fullbody + footer;
}

export function createSendEmailCommand(
  toAddress: string,
  player: unknown,
  subject: unknown,
  body: string,
  opts?: CreateSendEmailOptions,
): OutboundSesCommand {
  console.log('toAddress', toAddress, 'player', player, 'body', body);
  const subjectStr = String(subject);
  let fullbody =
    i18n.t('DearPlayer', { player }) +
    '\r\n\r\n' +
    body +
    '\r\n\r\n' +
    i18n.t('EmailOut');

  const links = opts?.userId ? buildUnsubscribeLinks(toAddress, opts.userId) : undefined;
  if (links) {
    fullbody = appendUnsubscribeFooter(fullbody, links.playUrl);
    return createSendRawEmailCommand(
      toAddress,
      subjectStr,
      fullbody,
      links.oneClickUrl,
    );
  }

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
        Data: subjectStr,
      },
    },
    Source: SES_FROM_ADDRESS,
  });
}