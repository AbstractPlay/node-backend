import { createPublicKey, verify, KeyObject } from 'crypto';

const AP_PUBLIC_KEY_URL = 'https://play.abstractplay.com/ap-public-key.txt';
const DEFAULT_SSH_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINBTbzcpb7MaQM3TIFzsS8YmPqqT2y+/fJgevp20lzLm';
const MAX_SIGNATURE_AGE_SEC = 5 * 60;

let cachedKey: KeyObject | undefined;
let fetchPromise: Promise<KeyObject> | undefined;

function parseSsh2PublicKeyFile(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('----'));
  const body = lines.join('');
  if (body.startsWith('ssh-')) {
    return body;
  }
  return `ssh-ed25519 ${body}`;
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
    let sshKey = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SSH_PUBLIC_KEY;

    if (!fromEnv) {
      try {
        const response = await fetch(AP_PUBLIC_KEY_URL, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          sshKey = parseSsh2PublicKeyFile(await response.text());
        }
      } catch (error) {
        console.warn('Unable to fetch AP bot public key; using embedded default', error);
      }
    }

    cachedKey = createPublicKey(sshKey);
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
