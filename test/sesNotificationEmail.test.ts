import { describe, expect, it } from 'vitest';
import { buildSesRawTextEmail } from '../lib/sesNotificationEmail.js';

describe('buildSesRawTextEmail', () => {
  it('includes RFC 8058 unsubscribe headers when one-click URL is set', () => {
    const raw = new TextDecoder().decode(
      buildSesRawTextEmail({
        toAddress: 'user@example.com',
        subject: 'Hi',
        body: 'Hello',
        listUnsubscribeUrl:
          'https://api.example.com/dev/unsubscribe-email?t=abc.def',
      }),
    );
    expect(raw).toContain('List-Unsubscribe: <https://api.example.com/dev/unsubscribe-email?t=abc.def>');
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(raw).toContain('Hello');
  });
});