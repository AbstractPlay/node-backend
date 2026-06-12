/**
 * Verify inbound AP webhook signatures (Ed25519).
 * See api/testBot.ts for the reference integration (handlePost flow).
 */
import { createPublicKey, verify, KeyObject } from 'crypto';

const AP_PUBLIC_KEY_URL = 'https://play.abstractplay.com/ap-public-key.txt';
const DEFAULT_SSH_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINBTbzcpb7MaQM3TIFzsS8YmPqqT2y+/fJgevp20lzLm';
const MAX_SIGNATURE_AGE_SEC = 5 * 60;

let cachedKey: KeyObject | undefined;
let fetchPromise: Promise<KeyObject> | undefined;

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

function decodePublicKeyEnv(raw: string): string {
  let key = stripWrappingQuotes(raw);

  if (!key.includes('ssh-') && !key.includes('---- BEGIN')) {
    const decoded = Buffer.from(key.replace(/\s+/g, ''), 'base64').toString('utf8').trim();
    if (decoded.includes('ssh-') || decoded.includes('---- BEGIN')) {
      key = decoded;
    }
  }

  return normalizeLineEndings(key);
}

function parseSsh2PublicKeyFile(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('----'));
  const base64Body = lines
    .filter(line => !line.startsWith('Comment:'))
    .join('');
  if (base64Body.startsWith('ssh-')) {
    return base64Body;
  }
  return `ssh-ed25519 ${base64Body}`;
}

function readLengthPrefixedString(buf: Buffer, offset: number): { value: Buffer; offset: number } {
  const len = buf.readUInt32BE(offset);
  offset += 4;
  return { value: buf.subarray(offset, offset + len), offset: offset + len };
}

function parseEd25519WireFormat(blob: Buffer): Buffer {
  let offset = 0;
  const keyType = readLengthPrefixedString(blob, offset);
  offset = keyType.offset;
  if (keyType.value.toString() !== 'ssh-ed25519') {
    throw new Error(`Unsupported SSH key type ${keyType.value.toString()}`);
  }

  const publicKey = readLengthPrefixedString(blob, offset);
  if (publicKey.value.length !== 32) {
    throw new Error('Invalid Ed25519 public key length');
  }

  return publicKey.value;
}

function extractEd25519PublicKeyBytes(keyMaterial: string): Buffer {
  const trimmed = keyMaterial.trim();

  if (trimmed.includes('---- BEGIN SSH2 PUBLIC KEY ----')) {
    return extractEd25519PublicKeyBytes(parseSsh2PublicKeyFile(trimmed));
  }

  const parts = trimmed.split(/\s+/).filter(part => part.length > 0);
  if (parts[0] === 'ssh-ed25519' && parts[1]) {
    return parseEd25519WireFormat(Buffer.from(parts[1], 'base64'));
  }

  if (parts.length === 1) {
    return parseEd25519WireFormat(Buffer.from(parts[0], 'base64'));
  }

  throw new Error('Unsupported AP bot public key format');
}

function createEd25519PublicKey(publicKeyBytes: Buffer): KeyObject {
  return createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: publicKeyBytes.toString('base64url'),
    },
    format: 'jwk',
  });
}

function loadPublicKeyFromMaterial(keyMaterial: string): KeyObject {
  if (
    keyMaterial.includes('ssh-ed25519')
    || keyMaterial.includes('---- BEGIN SSH2 PUBLIC KEY ----')
  ) {
    const publicKeyBytes = extractEd25519PublicKeyBytes(keyMaterial);
    return createEd25519PublicKey(publicKeyBytes);
  }

  return createPublicKey({ key: keyMaterial, format: 'pem' });
}

async function loadPublicKey(): Promise<KeyObject> {
  if (cachedKey) {
    return cachedKey;
  }
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    const fromEnv = process.env.AP_BOT_PUBLIC_KEY?.trim();
    let keyMaterial = fromEnv && fromEnv.length > 0
      ? decodePublicKeyEnv(fromEnv)
      : DEFAULT_SSH_PUBLIC_KEY;

    if (!fromEnv) {
      try {
        const response = await fetch(AP_PUBLIC_KEY_URL, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          keyMaterial = parseSsh2PublicKeyFile(await response.text());
        }
      } catch (error) {
        console.warn('Unable to fetch AP bot public key; using embedded default', error);
      }
    }

    cachedKey = loadPublicKeyFromMaterial(keyMaterial);
    return cachedKey;
  })();

  return fetchPromise;
}

export type BotSignatureHeaders = {
  timestamp: string;
  nonce: string;
  signature: string;
};

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) {
    return direct;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

export function extractBotSignatureHeaders(
  headers: Record<string, string | undefined>
): BotSignatureHeaders | undefined {
  const timestamp = headerValue(headers, 'X-Signature-Timestamp');
  const nonce = headerValue(headers, 'X-Signature-Nonce');
  const signature = headerValue(headers, 'X-Signature');
  if (!timestamp || !nonce || !signature) {
    return undefined;
  }
  return { timestamp, nonce, signature };
}

export async function verifyBotRequest(
  rawBody: string,
  headers: Record<string, string | undefined>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sigHeaders = extractBotSignatureHeaders(headers);
  if (!sigHeaders) {
    return { ok: false, reason: 'Missing signature headers' };
  }

  const timestampSec = Number.parseInt(sigHeaders.timestamp, 10);
  if (!Number.isFinite(timestampSec)) {
    return { ok: false, reason: 'Invalid signature timestamp' };
  }

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - timestampSec);
  if (ageSec > MAX_SIGNATURE_AGE_SEC) {
    return { ok: false, reason: 'Signature timestamp expired' };
  }

  const signingString = `${sigHeaders.timestamp}.${sigHeaders.nonce}.${rawBody}`;
  const publicKey = await loadPublicKey();
  const valid = verify(
    null,
    Buffer.from(signingString, 'utf8'),
    publicKey,
    Buffer.from(sigHeaders.signature, 'base64')
  );
  if (!valid) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return { ok: true };
}
