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

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

  return normalizeLineEndings(key);
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

function readLengthPrefixedString(buf: Buffer, offset: number): { value: Buffer; offset: number } {
  const len = buf.readUInt32BE(offset);
  offset += 4;
  return { value: buf.subarray(offset, offset + len), offset: offset + len };
}

function loadOpenSshEd25519PrivateKey(pem: string): KeyObject {
  const match = PEM_BLOCK_RE.exec(pem);
  if (!match || match[1] !== 'OPENSSH PRIVATE KEY') {
    throw new Error('Expected OPENSSH PRIVATE KEY PEM block');
  }

  const binary = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!binary.subarray(0, 15).equals(Buffer.from('openssh-key-v1\0'))) {
    throw new Error('Invalid OpenSSH key magic');
  }

  let offset = 15;
  const cipher = readLengthPrefixedString(binary, offset);
  offset = cipher.offset;
  const kdf = readLengthPrefixedString(binary, offset);
  offset = kdf.offset;
  const kdfOpts = readLengthPrefixedString(binary, offset);
  offset = kdfOpts.offset;
  const nKeys = binary.readUInt32BE(offset);
  offset += 4;

  if (nKeys !== 1) {
    throw new Error(`Expected 1 OpenSSH key, found ${nKeys}`);
  }

  const pubOuter = readLengthPrefixedString(binary, offset);
  offset = pubOuter.offset;
  const privOuter = readLengthPrefixedString(binary, offset);

  if (cipher.value.toString() !== 'none' || kdf.value.toString() !== 'none') {
    throw new Error('Encrypted OpenSSH private keys are not supported');
  }

  const priv = privOuter.value;
  let p = 0;
  const check1 = priv.readUInt32BE(p);
  p += 4;
  const check2 = priv.readUInt32BE(p);
  p += 4;
  if (check1 !== check2) {
    throw new Error('OpenSSH private key check ints do not match');
  }

  const keyType = readLengthPrefixedString(priv, p);
  p = keyType.offset;
  if (keyType.value.toString() !== 'ssh-ed25519') {
    throw new Error(`Unsupported OpenSSH key type ${keyType.value.toString()}`);
  }

  const pubKey = readLengthPrefixedString(priv, p);
  p = pubKey.offset;
  const privKey = readLengthPrefixedString(priv, p);

  if (privKey.value.length < 64) {
    throw new Error('Invalid Ed25519 OpenSSH private key payload');
  }

  const seed = privKey.value.subarray(0, 32);
  const publicKey = privKey.value.subarray(32, 64);
  if (pubKey.value.length > 0 && !pubKey.value.equals(publicKey)) {
    throw new Error('OpenSSH public key does not match private key payload');
  }

  return createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: seed.toString('base64url'),
      x: publicKey.toString('base64url'),
    },
    format: 'jwk',
  });
}

function loadPrivateKey(keyMaterial: string): KeyObject {
  try {
    return createPrivateKey({ key: keyMaterial, format: 'pem' });
  } catch (pemError) {
    if (!keyMaterial.includes('BEGIN OPENSSH PRIVATE KEY')) {
      const message = pemError instanceof Error ? pemError.message : String(pemError);
      throw new Error(`Unable to load OPENSSH_PRIVATE_KEY: ${message}`);
    }
  }

  try {
    return loadOpenSshEd25519PrivateKey(keyMaterial);
  } catch (opensshError) {
    const message = opensshError instanceof Error ? opensshError.message : String(opensshError);
    throw new Error(
      `Unable to load OPENSSH_PRIVATE_KEY: ${message}. Store base64-encoded unencrypted Ed25519 OpenSSH PEM.`
    );
  }
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
