import { createHmac, timingSafeEqual } from 'crypto';

export const EMAIL_UNSUBSCRIBE_TOKEN_VERSION = 1;
/** Footer links remain valid across long inbox retention (~6 months). */
export const EMAIL_UNSUBSCRIBE_TTL_SEC = 15552000;

export type EmailUnsubscribePayload = {
  v: number;
  u: string;
  e?: string;
  exp: number;
};

export type VerifiedEmailUnsubscribe = {
  userId: string;
  email?: string;
};

function readSecret(): string | undefined {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  return secret ? secret : undefined;
}

export function normalizeNotificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

function serializePayload(payload: EmailUnsubscribePayload): string {
  const base: Record<string, unknown> = {
    v: payload.v,
    u: payload.u,
    exp: payload.exp,
  };
  if (payload.e !== undefined && payload.e !== '') {
    base.e = payload.e;
  }
  return JSON.stringify(base);
}

function signPayloadString(payloadStr: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadStr, 'utf8').digest();
}

export function signEmailUnsubscribeToken(
  userId: string,
  email: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string | undefined {
  const secret = readSecret();
  if (!secret || !userId.trim()) {
    return undefined;
  }
  const normalizedEmail = normalizeNotificationEmail(email);
  const payload: EmailUnsubscribePayload = {
    v: EMAIL_UNSUBSCRIBE_TOKEN_VERSION,
    u: userId.trim(),
    e: normalizedEmail,
    exp: nowSec + EMAIL_UNSUBSCRIBE_TTL_SEC,
  };
  const payloadStr = serializePayload(payload);
  const sig = signPayloadString(payloadStr, secret);
  return `${Buffer.from(payloadStr, 'utf8').toString('base64url')}.${sig.toString('base64url')}`;
}

export function buildEmailUnsubscribeUrl(token: string): string | undefined {
  const base = process.env.PLAY_BASE_URL?.trim().replace(/\/$/, '');
  if (!base) {
    return undefined;
  }
  return `${base}/account/unsubscribe-email?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click POST target (API Gateway, not the play SPA). */
export function buildEmailUnsubscribeOneClickUrl(token: string): string | undefined {
  const base = process.env.API_BASE_URL?.trim().replace(/\/$/, '');
  if (!base) {
    return undefined;
  }
  return `${base}/unsubscribe-email?t=${encodeURIComponent(token)}`;
}

export function verifyEmailUnsubscribeToken(
  token: string,
): VerifiedEmailUnsubscribe | undefined {
  const secret = readSecret();
  if (!secret) {
    return undefined;
  }
  const trimmed = token.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) {
    return undefined;
  }
  const payloadB64 = trimmed.slice(0, dot);
  const sigB64 = trimmed.slice(dot + 1);
  let payloadStr: string;
  let sig: Buffer;
  try {
    payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    sig = Buffer.from(sigB64, 'base64url');
  } catch {
    return undefined;
  }
  const expected = signPayloadString(payloadStr, secret);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return undefined;
  }
  let parsed: EmailUnsubscribePayload;
  try {
    parsed = JSON.parse(payloadStr) as EmailUnsubscribePayload;
  } catch {
    return undefined;
  }
  if (
    parsed.v !== EMAIL_UNSUBSCRIBE_TOKEN_VERSION
    || typeof parsed.u !== 'string'
    || !parsed.u.trim()
    || typeof parsed.exp !== 'number'
    || !Number.isFinite(parsed.exp)
  ) {
    return undefined;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > parsed.exp) {
    return undefined;
  }
  const email =
    typeof parsed.e === 'string' && parsed.e.trim()
      ? normalizeNotificationEmail(parsed.e)
      : undefined;
  return { userId: parsed.u.trim(), email };
}