import { describe, expect, it } from 'vitest';
import {
  configureDevAmplifyAuth,
  subFromIdToken,
} from '../lib/test/devAmplifyAuth.js';

describe('devAmplifyAuth', () => {
  it('configures Amplify without throwing', () => {
    expect(() => configureDevAmplifyAuth()).not.toThrow();
  });

  it('parses sub from a JWT payload', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'abc-123' })).toString('base64url');
    const token = `hdr.${payload}.sig`;
    expect(subFromIdToken(token)).toBe('abc-123');
  });
});
