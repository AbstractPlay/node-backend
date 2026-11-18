import { describe, expect, it } from 'vitest';
import { createSendEmailCommand } from '../lib/createSendEmailCommand.js';
import { SES_FROM_ADDRESS } from '../lib/sesFromAddress.js';

describe('SES From address', () => {
  it('matches cognito-pool-auth-settings emailConfiguration', () => {
    expect(SES_FROM_ADDRESS).toBe('noreply@abstractplay.com');
  });

  it('createSendEmailCommand uses canonical From', () => {
    const cmd = createSendEmailCommand('a@b.com', 'Ada', 'Hi', 'Body');
    expect(cmd.input.Source).toBe(SES_FROM_ADDRESS);
  });
});