import type { TFunction } from 'i18next';

type NamedPlayer = { id: string; name: string };

export function opponentNameForPlayer(
  players: NamedPlayer[],
  recipientId: string,
): string | undefined {
  const opponent = players.find((p) => p.id !== recipientId);
  return opponent?.name;
}

export function buildYourTurnPushBody(
  t: TFunction,
  metaGameDisplay: string,
  opponentName: string | undefined,
  moveNumber: number,
): string {
  if (opponentName !== undefined && opponentName.length > 0) {
    return t('YourMovePushBody', {
      metaGame: metaGameDisplay,
      opponentName,
      moveNumber,
    });
  }
  return t('YourMovePushBodyNoOpponent', {
    metaGame: metaGameDisplay,
    moveNumber,
  });
}

export function buildGameOverPushBody(
  t: TFunction,
  metaGameDisplay: string,
  result: 'win' | 'lose' | 'draw',
  scoresLine?: string,
): string {
  const parts = [
    t('GameOverPushBody', { metaGame: metaGameDisplay }),
    t('GameOverResult', { context: result }),
  ];
  if (scoresLine !== undefined && scoresLine.length > 0) {
    parts.push(scoresLine);
  }
  return parts.join(' ');
}

export function pushCollapseKeyForGame(topic: string, gameId: string): string {
  return `${topic}:${gameId}`;
}