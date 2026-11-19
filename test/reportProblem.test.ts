import { describe, expect, it } from 'vitest';
import { reportProblem } from '../lib/public/analytics.js';

describe('reportProblem', () => {
  it('returns success without side effects', async () => {
    const result = await reportProblem({ error: 'test stack trace' });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ message: 'Reported' });
  });
});