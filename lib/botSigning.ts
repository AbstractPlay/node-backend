import { createPrivateKey, sign, randomBytes, KeyObject } from 'crypto';

let cachedKey: KeyObject | undefined;

function getSigningKey(): KeyObject {
  if (cachedKey) {
    return cachedKey;
  }
  const raw = process.env.OPENSSH_PRIVATE_KEY;
  if (!raw) {
    throw new Error('OPENSSH_PRIVATE_KEY environment variable is not set');
  }
  const keyMaterial = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  cachedKey = createPrivateKey(keyMaterial);
  return cachedKey;
}

export type BotSignatureHeaders = {
  'X-Signature-Timestamp': string;
  'X-Signature-Nonce': string;
  'X-Signature': string;
};

export function signBotPayload(rawBody: string): BotSignatureHeaders {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const signingString = `${timestamp}.${nonce}.${rawBody}`;
  const signature = sign(null, Buffer.from(signingString, 'utf8'), getSigningKey());
  return {
    'X-Signature-Timestamp': timestamp,
    'X-Signature-Nonce': nonce,
    'X-Signature': signature.toString('base64'),
  };
}
