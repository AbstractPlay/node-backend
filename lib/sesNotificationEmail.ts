import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import { SES_FROM_ADDRESS } from './sesFromAddress.js';

function mimeSubjectLine(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return `Subject: ${subject}`;
  }
  const encoded = Buffer.from(subject, 'utf8').toString('base64');
  return `Subject: =?UTF-8?B?${encoded}?=`;
}

export function buildSesRawTextEmail(params: {
  toAddress: string;
  subject: string;
  body: string;
  listUnsubscribeUrl?: string;
}): Uint8Array {
  const headerLines = [
    `From: ${SES_FROM_ADDRESS}`,
    `To: ${params.toAddress}`,
    mimeSubjectLine(params.subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (params.listUnsubscribeUrl) {
    headerLines.push(`List-Unsubscribe: <${params.listUnsubscribeUrl}>`);
    headerLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    headerLines.push('List-ID: game-notifications.abstractplay.com');
  }
  const raw = `${headerLines.join('\r\n')}\r\n\r\n${params.body}`;
  return Buffer.from(raw, 'utf8');
}

export function createSendRawEmailCommand(
  toAddress: string,
  subject: string,
  body: string,
  listUnsubscribeUrl?: string,
) {
  return new SendRawEmailCommand({
    Source: SES_FROM_ADDRESS,
    Destinations: [toAddress],
    RawMessage: {
      Data: buildSesRawTextEmail({
        toAddress,
        subject,
        body,
        listUnsubscribeUrl,
      }),
    },
  });
}