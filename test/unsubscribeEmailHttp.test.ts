import { describe, expect, it } from 'vitest';
import { handler } from '../api/unsubscribeEmailHttp.js';

describe('unsubscribeEmailHttp', () => {
  it('GET redirects to play when token present', async () => {
    process.env.PLAY_BASE_URL = 'https://play.example.com';
    const res = await handler({
      httpMethod: 'GET',
      queryStringParameters: { t: 'signed.token' },
    });
    expect(res.statusCode).toBe(302);
    expect((res.headers as { Location?: string })?.Location).toBe(
      'https://play.example.com/account/unsubscribe-email?t=signed.token',
    );
  });
});