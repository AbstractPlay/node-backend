export const ARENA_FEEDBACK_PK_PREFIX = 'ARENAFB#';

export function arenaFeedbackPk(userId: string): string {
  return `${ARENA_FEEDBACK_PK_PREFIX}${userId}`;
}

export function arenaFeedbackSk(metaGame: string, gameId: string): string {
  return `${metaGame}#${gameId}`;
}
