import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type GamePlayer = { id: string };

export type GameForCommentAuth = {
  players: GamePlayer[];
};

export type InGameCommentAuthResult =
  | { ok: true }
  | { ok: false; message: string };

export function gameRecordSk(metaGame: string, cbit: 0 | 1, gameId: string): string {
  return `${metaGame}#${cbit}#${gameId}`;
}

async function getGameRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  cbit: 0 | 1,
): Promise<GameForCommentAuth | undefined> {
  const data = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'GAME',
        sk: gameRecordSk(metaGame, cbit, gameId),
      },
    }),
  );
  if (data.Item === undefined) {
    return undefined;
  }
  const game = data.Item as GameForCommentAuth;
  if (!Array.isArray(game.players)) {
    return { players: [] };
  }
  return game;
}

async function isSiteAdmin(
  client: DynamoDBDocumentClient,
  tableName: string,
  userid: string,
): Promise<boolean> {
  const user = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'USER',
        sk: userid,
      },
    }),
  );
  return user.Item !== undefined && user.Item.admin === true;
}

export function isGameParticipant(game: GameForCommentAuth, userid: string): boolean {
  return game.players.some((p) => p.id === userid);
}

/**
 * Fail-closed gate for in-game chat (GAMECOMMENTS via submit_comment).
 * Empty userid skips auth (system messages from invokePie).
 */
export async function checkInGameCommentAuth(
  client: DynamoDBDocumentClient,
  tableName: string,
  userid: string,
  metaGame: string,
  gameId: string,
): Promise<InGameCommentAuthResult> {
  if (!userid) {
    return { ok: true };
  }

  const activeGame = await getGameRecord(client, tableName, metaGame, gameId, 0);
  if (activeGame !== undefined) {
    if (isGameParticipant(activeGame, userid)) {
      return { ok: true };
    }
    if (await isSiteAdmin(client, tableName, userid)) {
      return { ok: true };
    }
    return {
      ok: false,
      message: 'Only game participants and admins can comment on active games.',
    };
  }

  const completedGame = await getGameRecord(client, tableName, metaGame, gameId, 1);
  if (completedGame !== undefined) {
    return {
      ok: false,
      message: 'Game is completed; use save_exploration for post-game comments.',
    };
  }

  return {
    ok: false,
    message: 'Game not found.',
  };
}
