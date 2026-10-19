import { BatchGetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type GameComment = {
  comment: string;
  userId: string;
  moveNumber?: number;
  timeStamp?: number;
  system?: boolean;
};

/** Player-authored in-game chat (not pie / system log lines). */
export function isUserChatComment(userId: string | undefined | null): boolean {
  if (userId == null || typeof userId !== 'string') {
    return false;
  }
  return userId.trim().length > 0;
}

export function isInterestingComment(comment: string | undefined | null): boolean {
  if (typeof comment !== 'string' || comment.trim().length === 0) {
    return false;
  }
  const normalized = comment.toLowerCase().trim();
  const withoutPunctuation = normalized.replace(/[^\w\s]/g, '');

  const boringPhrases = new Set([
    'gg', 'glhf', 'gl', 'hf', 'tagg', 'hi', 'hello', 'hey',
    'thanks', 'thx', 'ty', 'yw', 'np', 'wp', 'well played',
    'good game', 'good luck', 'have fun', 'thanks for the game',
    'pie invoked', 'move', 'gg sir', 'gg!', 'tagg!', 'glhf!',
    'to a good game', 'have a good game', 'good luck!', 'have fun!',
    'thanks for playing', 'thanks for the game!', 'gg thanks',
    'yoyo', 'yoyo gl', 'yoyo gl hf',
  ]);

  if (boringPhrases.has(normalized) || boringPhrases.has(withoutPunctuation)) {
    return false;
  }

  const words = withoutPunctuation.split(/\s+/).filter(w => w.length > 0);
  const commonWords = new Set([
    'gg', 'gl', 'hf', 'tagg', 'hi', 'hello', 'yoyo',
    'thanks', 'thx', 'ty', 'wp', 'move', 'pie', 'invoked',
    'good', 'game', 'luck', 'fun', 'for', 'the', 'a', 'to',
    'have', 'sir', 'well', 'played', 'you', 'too',
  ]);

  if (words.length <= 3 && words.every(w => commonWords.has(w))) {
    return false;
  }

  return true;
}

export function hasInterestingUserGameComments(
  comments: GameComment[] | undefined,
): boolean {
  if (!comments?.length) {
    return false;
  }
  return comments.some(
    (c) => isUserChatComment(c?.userId) && isInterestingComment(c?.comment),
  );
}

function normalizeStoredComments(raw: unknown): GameComment[] {
  return Array.isArray(raw) ? raw : [];
}

const BATCH_GET_CHUNK_SIZE = 25;

async function batchGetGameComments(
  client: DynamoDBDocumentClient,
  tableName: string,
  keys: Array<{ pk: string; sk: string }>,
): Promise<Map<string, GameComment[]>> {
  const commentMap = new Map<string, GameComment[]>();
  for (let i = 0; i < keys.length; i += BATCH_GET_CHUNK_SIZE) {
    let pending = keys.slice(i, i + BATCH_GET_CHUNK_SIZE);
    while (pending.length > 0) {
      const res = await client.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: pending },
          },
        }),
      );
      for (const item of res.Responses?.[tableName] ?? []) {
        const id = item.sk as string;
        commentMap.set(id, normalizeStoredComments(item.comments));
      }
      const unprocessed = res.UnprocessedKeys?.[tableName]?.Keys;
      pending = (unprocessed ?? []) as Array<{ pk: string; sk: string }>;
    }
  }
  return commentMap;
}

/** Drop commented=1 when only system lines (e.g. pie) are in GAMECOMMENTS. */
export async function sanitizeInGameCommentedFlags(
  client: DynamoDBDocumentClient,
  tableName: string,
  games: Array<{ id: string; commented?: number }>,
): Promise<void> {
  const targets = games.filter(
    (g) => (g.commented ?? 0) === 1 && typeof g.id === 'string' && g.id.length > 0,
  );
  if (targets.length === 0) {
    return;
  }

  const keysByGameId = new Map<string, { pk: string; sk: string }>();
  for (const game of targets) {
    keysByGameId.set(game.id, { pk: 'GAMECOMMENTS', sk: game.id });
  }
  const commentMap = await batchGetGameComments(
    client,
    tableName,
    [...keysByGameId.values()],
  );

  for (const game of targets) {
    if (!hasInterestingUserGameComments(commentMap.get(game.id))) {
      game.commented = 0;
    }
  }
}
