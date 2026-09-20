import { BatchGetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type GameComment = {
  comment: string;
  userId: string;
  moveNumber?: number;
  timeStamp?: number;
  system?: boolean;
};

/** Player-authored in-game chat (not pie / system log lines). */
export function isUserChatComment(userId: string): boolean {
  return userId.trim().length > 0;
}

export function isInterestingComment(comment: string): boolean {
  if (!comment || comment.trim().length === 0) {
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
    (c) => isUserChatComment(c.userId) && isInterestingComment(c.comment),
  );
}

/** Drop commented=1 when only system lines (e.g. pie) are in GAMECOMMENTS. */
export async function sanitizeInGameCommentedFlags(
  client: DynamoDBDocumentClient,
  tableName: string,
  games: Array<{ id: string; commented?: number }>,
): Promise<void> {
  const targets = games.filter((g) => (g.commented ?? 0) === 1);
  if (targets.length === 0) {
    return;
  }

  const commentMap = new Map<string, GameComment[]>();
  const keys = targets.map((g) => ({ pk: 'GAMECOMMENTS', sk: g.id }));

  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const res = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: { Keys: chunk },
        },
      }),
    );
    for (const item of res.Responses?.[tableName] ?? []) {
      const id = item.sk as string;
      commentMap.set(id, (item.comments as GameComment[]) ?? []);
    }
  }

  for (const game of targets) {
    if (!hasInterestingUserGameComments(commentMap.get(game.id))) {
      game.commented = 0;
    }
  }
}
