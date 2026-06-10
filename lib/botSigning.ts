import { createPrivateKey, sign, randomBytes, KeyObject } from 'crypto';

let cachedKey: KeyObject | undefined;

const PEM_BLOCK_RE = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

function stripWrappingQuotes(value: string): string {
  const key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"'))
    || (key.startsWith("'") && key.endsWith("'"))
  ) {
    return key.slice(1, -1).trim();
  }
  return key;
}

function decodePrivateKeyEnv(raw: string): string {
  let key = stripWrappingQuotes(raw);

  if (!key.includes('-----BEGIN')) {
    const decoded = Buffer.from(key.replace(/\s+/g, ''), 'base64').toString('utf8').trim();
    if (!decoded.includes('-----BEGIN')) {
      throw new Error(
        'OPENSSH_PRIVATE_KEY must be PEM text or base64-encoded PEM text'
      );
    }
    key = decoded;
  }

  return key;
}

function normalizePrivateKeyMaterial(raw: string): string {
  let key = decodePrivateKeyEnv(raw);
  key = key.replace(/\\n/g, '\n');

  const match = PEM_BLOCK_RE.exec(key);
  if (!match) {
    return key;
  }

  const label = match[1];
  const body = match[2].replace(/\s+/g, '');
  if (body.length === 0) {
    throw new Error('OPENSSH_PRIVATE_KEY PEM block is empty');
  }

  const wrappedBody = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `-----BEGIN ${label}-----\n${wrappedBody}\n-----END ${label}-----`;
}

function loadPrivateKey(keyMaterial: string): KeyObject {
  const attempts: { format?: 'pem' }[] = [
    { format: 'pem' },
    {},
  ];

  let lastError: unknown;
  for (const options of attempts) {
    try {
      return options.format
        ? createPrivateKey({ key: keyMaterial, ...options })
        : createPrivateKey(keyMaterial);
    } catch (error) {
      lastError = error;
    }
  }

  const hint = keyMaterial.includes('BEGIN OPENSSH PRIVATE KEY')
    ? 'Store OPENSSH_PRIVATE_KEY as base64-encoded PEM, or PEM with real newlines.'
    : 'OPENSSH_PRIVATE_KEY must be PEM or base64-encoded PEM.';
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Unable to load OPENSSH_PRIVATE_KEY: ${message}. ${hint}`);
}

function getSigningKey(): KeyObject {
  if (cachedKey) {
    return cachedKey;
  }
  const raw = process.env.OPENSSH_PRIVATE_KEY;
  if (!raw) {
    throw new Error('OPENSSH_PRIVATE_KEY environment variable is not set');
  }
  const keyMaterial = normalizePrivateKeyMaterial(raw);
  cachedKey = loadPrivateKey(keyMaterial);
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
