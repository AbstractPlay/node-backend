import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
});

export const WS_CONNECTION_TTL_SEC = 86400;

export type WsConnectionItem = {
  pk: "wsConnections";
  sk: string;
  connectionId: string;
  userId: string;
  invisible?: boolean;
  endpoint: string;
  ttl: number;
  watchingGames?: Set<string> | string[];
  wantsPresence?: boolean;
  watchVersion?: number;
};

export function gameWatchKey(meta: string, id: string): string {
  return `${meta}#${id}`;
}

export function connectionTtl(): number {
  return Math.floor(Date.now() / 1000) + WS_CONNECTION_TTL_SEC;
}

export async function listAllConnections(): Promise<WsConnectionItem[]> {
  const items: WsConnectionItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const params: QueryCommandInput = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "wsConnections" },
      ExclusiveStartKey: lastKey,
    };
    const result = await ddbDocClient.send(new QueryCommand(params));
    for (const item of result.Items ?? []) {
      items.push(item as WsConnectionItem);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export async function getConnection(
  connectionId: string
): Promise<WsConnectionItem | undefined> {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId },
    })
  );
  return result.Item as WsConnectionItem | undefined;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE!,
      Key: { pk: "wsConnections", sk: connectionId },
    })
  );
}

export function watchingGamesHas(
  conn: WsConnectionItem,
  gameKey: string
): boolean {
  if (!conn.watchingGames) {
    return false;
  }
  if (conn.watchingGames instanceof Set) {
    return conn.watchingGames.has(gameKey);
  }
  return Array.isArray(conn.watchingGames) && conn.watchingGames.includes(gameKey);
}

export function usesStrictGameWatch(conn: WsConnectionItem): boolean {
  return conn.watchVersion === 1;
}

export function isLegacyGameFanout(conn: WsConnectionItem): boolean {
  return conn.watchVersion !== 1 && conn.watchingGames === undefined;
}

export function wantsPresenceUpdates(conn: WsConnectionItem): boolean {
  return conn.wantsPresence !== false;
}
