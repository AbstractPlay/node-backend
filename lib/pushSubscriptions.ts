import { createHash } from 'crypto';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import webpush, { RequestOptions } from 'web-push';
import { ddbDocClient } from './ddb';

let docClient: DynamoDBDocumentClient = ddbDocClient;

/** @internal test-only */
export function __setDocClientForTests(client: DynamoDBDocumentClient | undefined): void {
  docClient = client ?? ddbDocClient;
}

export type PushCredentials = {
  pk: string;
  sk: string;
  payload: any;
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

function tableName(): string {
  return process.env.ABSTRACT_PLAY_TABLE!;
}

export async function queryPushSubscriptions(userId: string): Promise<PushCredentials[]> {
  const subscriptions: PushCredentials[] = [];
  const skPrefix = `${userId}#`;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: {
          ':pk': PUSH_PK,
          ':skPrefix': skPrefix,
        },
        ExclusiveStartKey: lastKey,
      })
    );
    if (result.Items !== undefined) {
      subscriptions.push(...(result.Items as PushCredentials[]));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== undefined);

  const legacy = await docClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk: userId },
    })
  );
  if (legacy.Item !== undefined) {
    subscriptions.push(legacy.Item as PushCredentials);
  }

  return subscriptions;
}

export async function deletePushSubscription(sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk },
    })
  );
}

export async function deleteAllPushSubscriptions(userId: string): Promise<void> {
  const subscriptions = await queryPushSubscriptions(userId);
  await Promise.all(subscriptions.map((sub) => deletePushSubscription(sub.sk)));
}

export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string
): Promise<void> {
  if (endpoint === undefined || typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error('deletePush: missing endpoint');
  }
  await deletePushSubscription(pushSortKey(userId, endpoint));
}

export async function savePushSubscription(userId: string, payload: any): Promise<void> {
  const endpoint = payload?.endpoint;
  if (endpoint === undefined || typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error('savePush: missing payload.endpoint');
  }

  const sk = pushSortKey(userId, endpoint);
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: PUSH_PK,
        sk,
        payload,
        endpoint,
        updatedAt: new Date().toISOString(),
      },
    })
  );

  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: PUSH_PK, sk: userId },
    })
  );
}

export type SendNotificationFn = (
  subscription: any,
  payload: string,
  options: RequestOptions
) => Promise<unknown>;

export async function sendPushToSubscriptions(
  opts: PushOptions,
  subscriptions: PushCredentials[],
  sendNotification: SendNotificationFn = webpush.sendNotification.bind(webpush),
  logError: (err: unknown) => void = console.error
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
    // @ts-ignore web-push topic option
    topic,
  };
  const payload = JSON.stringify({ title, body, url, topic });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const result = await sendNotification(sub.payload, payload, options);
        console.log(`Result of webpush for ${sub.sk}:`);
        console.log(result);
      } catch (err: any) {
        if (('statusCode' in err) && PERMANENT_FAILURES.has(err.statusCode)) {
          console.log(`Removing stale push subscription ${sub.sk} (${err.statusCode})`);
          await deletePushSubscription(sub.sk);
        } else {
          logError(err);
        }
      }
    })
  );
}
