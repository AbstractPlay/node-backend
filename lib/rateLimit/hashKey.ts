import { createHash } from 'crypto';

/** Stable short hash for rate-limit partition keys (IP, email buckets, etc.). */
export function hashRateKey(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}