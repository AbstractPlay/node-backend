import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import { createSendEmailCommand } from '../lib/createSendEmailCommand.js';
import { initi18n } from '../lib/api/i18n.js';
import { SES_FROM_ADDRESS } from '../lib/sesFromAddress.js';

describe('SES From address', () => {
  const prevSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  const prevBase = process.env.PLAY_BASE_URL;
  const prevApi = process.env.API_BASE_URL;

  beforeEach(async () => {
    await initi18n('en');
  });

  afterEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = prevSecret;
    process.env.PLAY_BASE_URL = prevBase;
    process.env.API_BASE_URL = prevApi;
  });

  it('matches cognito-pool-auth-settings emailConfiguration', () => {
    expect(SES_FROM_ADDRESS).toBe('noreply@abstractplay.com');
  });

  it('createSendEmailCommand uses canonical From', () => {
    const cmd = createSendEmailCommand('a@b.com', 'Ada', 'Hi', 'Body');
    expect(cmd.input.Source).toBe(SES_FROM_ADDRESS);
  });

  it('appends unsubscribe footer when userId and secret are set', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe';
    process.env.PLAY_BASE_URL = 'https://play.abstractplay.com';
    process.env.API_BASE_URL = 'https://api.example.com/dev';
    const cmd = createSendEmailCommand('a@b.com', 'Ada', 'Hi', 'Body', {
      userId: '11111111-1111-1111-1111-111111111111',
    });
    expect(cmd).toBeInstanceOf(SendRawEmailCommand);
    const raw = new TextDecoder().decode(
      (cmd as SendRawEmailCommand).input.RawMessage?.Data ?? new Uint8Array(),
    );
    expect(raw).toContain('turn off all email notifications');
    expect(raw).toContain('/account/unsubscribe-email?t=');
    expect(raw).toContain('List-Unsubscribe: <');
    expect(raw).toContain('/unsubscribe-email?t=');
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(raw).toContain('List-ID: game-notifications.abstractplay.com');
  });
});