import { afterEach, describe, expect, it } from 'vitest';
import {
  EMAIL_UNSUBSCRIBE_TTL_SEC,
  buildEmailUnsubscribeUrl,
  signEmailUnsubscribeToken,
  verifyEmailUnsubscribeToken,
} from '../lib/emailUnsubscribeToken.js';

const USER = '11111111-1111-1111-1111-111111111111';
const EMAIL = 'Player@Example.com';

describe('emailUnsubscribeToken', () => {
  const prevSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  const prevBase = process.env.PLAY_BASE_URL;

  afterEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = prevSecret;
    process.env.PLAY_BASE_URL = prevBase;
  });

  it('round-trips a signed token', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe';
    process.env.PLAY_BASE_URL = 'https://play.dev.abstractplay.com';
    const now = Math.floor(Date.now() / 1000);
    const token = signEmailUnsubscribeToken(USER, EMAIL, now);
    expect(token).toBeTruthy();
    const verified = verifyEmailUnsubscribeToken(token!);
    expect(verified).toEqual({ userId: USER, email: 'player@example.com' });
    const url = buildEmailUnsubscribeUrl(token!);
    expect(url).toMatch(
      /^https:\/\/play\.dev\.abstractplay\.com\/account\/unsubscribe-email\?t=/,
    );
  });

  it('rejects expired tokens', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe';
    const expiredAt = 1_000_000;
    const token = signEmailUnsubscribeToken(USER, EMAIL, expiredAt);
    expect(token).toBeTruthy();
    const verified = verifyEmailUnsubscribeToken(token!);
    expect(verified).toBeUndefined();
    expect(EMAIL_UNSUBSCRIBE_TTL_SEC).toBeGreaterThan(0);
  });

  it('rejects tampered tokens', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe';
    const token = signEmailUnsubscribeToken(USER, EMAIL, 1_700_000_000)!;
    const tampered = `${token}x`;
    expect(verifyEmailUnsubscribeToken(tampered)).toBeUndefined();
  });
});