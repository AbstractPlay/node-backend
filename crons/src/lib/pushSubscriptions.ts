import { createHash } from 'crypto';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import webpush, { type RequestOptions } from 'web-push';

export type PushCredentials = {
  pk: string;
  sk: string;
  payload: unknown;
  endpoint?: string;
  updatedAt?: string;
};

export type PushOptions = {
  userId: string;
  title: string;
  body: string;
  topic: 'yourturn' | 'ended' | 'started' | 'challenges' | 'test' | 'tournament';
  url?: string;
};

const PUSH_PK = 'PUSH';
const PERMANENT_FAILURES = new Set([404, 410]);

export function pushSubscriptionKey(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

export function pushSortKey(userId: string, endpoint: string): string {
  return `${userId}#${pushSubscriptionKey(endpoint)}`;
}

export async function queryPushSubscriptions(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<PushCredentials[]> {
  const subscriptions: PushCredentials[] = [];
  const skPrefix = `${userId}#`;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': PUSH_PK,
        ':skPrefix': skPrefix,
      },
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items !== undefined) {
      subscriptions.push(...(result.Items as PushCredentials[]));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== undefined);

  const legacy = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: PUSH_PK, sk: userId },
  }));
  if (legacy.Item !== undefined) {
    subscriptions.push(legacy.Item as PushCredentials);
  }

  return subscriptions;
}

async function deletePushSubscription(
  client: DynamoDBDocumentClient,
  tableName: string,
  sk: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: PUSH_PK, sk },
  }));
}

export type SendNotificationFn = (
  subscription: unknown,
  payload: string,
  options: RequestOptions,
) => Promise<unknown>;

export async function sendPushToSubscriptions(
  client: DynamoDBDocumentClient,
  tableName: string,
  opts: PushOptions,
  subscriptions: PushCredentials[],
  sendNotification: SendNotificationFn = webpush.sendNotification.bind(webpush),
  logError: (err: unknown) => void = console.error,
): Promise<void> {
  if (subscriptions.length === 0) {
    return;
  }

  let subject = 'https://play.abstractplay.com';
  if (process.env.WEBSOCKET_STAGE === 'dev') {
    subject = 'https://play.dev.abstractplay.com';
  }

  const { body, title, topic, url } = opts;
  const options: RequestOptions = {
    vapidDetails: {
      subject,
      publicKey: process.env.VAPID_PUBLIC_KEY as string,
      privateKey: process.env.VAPID_PRIVATE_KEY as string,
    },
    // @ts-expect-error web-push topic option
    topic,
  };
  const payload = JSON.stringify({ title, body, url, topic });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await sendNotification(sub.payload, payload, options);
      } catch (err: unknown) {
        const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
          ? (err as { statusCode: number }).statusCode
          : undefined;
        if (statusCode !== undefined && PERMANENT_FAILURES.has(statusCode)) {
          console.log(`Removing stale push subscription ${sub.sk} (${statusCode})`);
          await deletePushSubscription(client, tableName, sub.sk);
        } else {
          logError(err);
        }
      }
    }),
  );
}

export async function sendPush(
  client: DynamoDBDocumentClient,
  tableName: string,
  opts: PushOptions,
): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey === undefined || publicKey === '' || privateKey === undefined || privateKey === '') {
    console.log('VAPID keys not configured; skipping push');
    return;
  }
  const subscriptions = await queryPushSubscriptions(client, tableName, opts.userId);
  await sendPushToSubscriptions(client, tableName, opts, subscriptions);
}
