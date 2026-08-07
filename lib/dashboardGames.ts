import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  applyOverlayFields,
  listUserGameOverlays,
  type UserGameOverlay,
} from './userGameOverlay';

export type DashboardGame = {
  id: string;
  metaGame: string;
  players: { id: string; name: string; time?: number }[];
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  lastMoveTime: number;
  variants?: string[];
  gameStarted?: number;
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  seen?: number;
  lastChat?: number;
  commented?: number;
  note?: string;
};

export type CurrentGameIndexRow = {
  pk: string;
  sk: string;
  id?: string;
  metaGame: string;
  players: DashboardGame['players'];
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  lastMoveTime: number;
  variants?: string[];
  gameStarted?: number;
  numMoves?: number;
};

export function isActiveDashboardGame(game: { toMove?: string | boolean[] | null }): boolean {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

export function currentRowToGame(row: CurrentGameIndexRow): DashboardGame {
  const game: DashboardGame = {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    players: row.players,
    clockHard: row.clockHard,
    noExplore: row.noExplore ?? false,
    toMove: row.toMove,
    lastMoveTime: row.lastMoveTime,
    variants: row.variants,
    gameStarted: row.gameStarted,
  };
  if (row.numMoves !== undefined) {
    game.numMoves = row.numMoves;
  }
  return game;
}

async function listCurrentGameRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<CurrentGameIndexRow[]> {
  const items: CurrentGameIndexRow[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `CURRENTGAMES#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item as CurrentGameIndexRow);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export function mergeDashboardGames(
  currentRows: CurrentGameIndexRow[],
  overlays: Map<string, UserGameOverlay>,
  legacyGames: DashboardGame[],
): DashboardGame[] {
  const legacyById = new Map(legacyGames.map(game => [game.id, game]));
  const indexById = new Map(
    currentRows.map(row => {
      const game = currentRowToGame(row);
      return [game.id, applyOverlayFields(game, overlays.get(game.id), legacyById.get(game.id))];
    }),
  );
  const useIndex = currentRows.length > 0;

  if (!useIndex) {
    return legacyGames.map(game => applyOverlayFields({ ...game }, overlays.get(game.id), game));
  }

  const result: DashboardGame[] = [];
  const emittedActive = new Set<string>();

  for (const legacy of legacyGames) {
    if (isActiveDashboardGame(legacy)) {
      const indexed = indexById.get(legacy.id);
      if (indexed) {
        result.push(indexed);
        emittedActive.add(legacy.id);
      } else {
        result.push(applyOverlayFields({ ...legacy }, overlays.get(legacy.id), legacy));
      }
    } else {
      result.push(applyOverlayFields({ ...legacy }, overlays.get(legacy.id), legacy));
    }
  }

  for (const [id, game] of indexById) {
    if (!emittedActive.has(id)) {
      result.push(game);
    }
  }

  return result;
}

export async function loadDashboardGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  legacyGames: DashboardGame[],
): Promise<DashboardGame[]> {
  const [currentRows, overlays] = await Promise.all([
    listCurrentGameRows(client, tableName, userId),
    listUserGameOverlays(client, tableName, userId),
  ]);
  return mergeDashboardGames(currentRows, overlays, legacyGames);
}
