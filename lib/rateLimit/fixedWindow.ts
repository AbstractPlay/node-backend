import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type RateLimitWindow = 'minute' | 'hour' | 'day';

export function windowSortKey(nowMs: number, window: RateLimitWindow): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  if (window === 'day') {
    return `${y}-${mo}-${day}`;
  }
  if (window === 'hour') {
    return `${y}-${mo}-${day}T${h}`;
  }
  return `${y}-${mo}-${day}T${h}:${min}Z`;
}

export function windowExpiresAtSec(nowMs: number, window: RateLimitWindow): number {
  const nowSec = Math.floor(nowMs / 1000);
  if (window === 'day') {
    return nowSec + 86_400 * 2;
  }
  if (window === 'hour') {
    return nowSec + 86_400;
  }
  return nowSec + 7200;
}

export type ConsumeFixedWindowOpts = {
  tableName: string;
  client: DynamoDBDocumentClient;
  pk: string;
  sk: string;
  limit: number;
  expiresAtSec: number;
};

export type ConsumeFixedWindowResult =
  | { allowed: true }
  | { allowed: false; reason: 'limit' }
  | { allowed: true; failOpen: true };

function isConditionalCheckFailed(err: unknown): boolean {
  return (
    typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException'
  );
}

/** One conditional increment; does not increment when already at limit. */
export async function consumeFixedWindowLimit(
  opts: ConsumeFixedWindowOpts,
): Promise<ConsumeFixedWindowResult> {
  try {
    await opts.client.send(new UpdateCommand({
      TableName: opts.tableName,
      Key: { pk: opts.pk, sk: opts.sk },
      UpdateExpression: 'SET #c = if_not_exists(#c, :zero) + :inc, expiresAt = :exp',
      ConditionExpression: 'attribute_not_exists(#c) OR #c < :limit',
      ExpressionAttributeNames: { '#c': 'c' },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1,
        ':limit': opts.limit,
        ':exp': opts.expiresAtSec,
      },
    }));
    return { allowed: true };
  }
  catch (err) {
    if (isConditionalCheckFailed(err)) {
      return { allowed: false, reason: 'limit' };
    }
    console.warn(JSON.stringify({
      evt: 'public_read_rate_limit_fail_open',
      pk: opts.pk,
      sk: opts.sk,
      message: err instanceof Error ? err.message : String(err),
    }));
    return { allowed: true, failOpen: true };
  }
}