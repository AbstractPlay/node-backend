import i18n from '../i18nInstance.js';

export type EventEndMessageContext = {
  eventName: string;
  eventId: string;
  recipientUserId: string;
  winnerIds: string[];
  winnerNames: string[];
};

function winnerLine(ctx: EventEndMessageContext): string | undefined {
  if (ctx.winnerNames.length === 0) {
    return undefined;
  }
  if (ctx.winnerNames.length === 1) {
    const context = ctx.winnerIds[0] === ctx.recipientUserId ? 'you' : 'other';
    return String(i18n.t('EventEndWinner', { context, winnerName: ctx.winnerNames[0] }));
  }
  if (ctx.winnerIds.includes(ctx.recipientUserId)) {
    const others = ctx.winnerNames.filter((_, i) => ctx.winnerIds[i] !== ctx.recipientUserId);
    if (others.length === 0) {
      return String(i18n.t('EventEndWinner_you'));
    }
    return String(i18n.t('EventEndWinner_youWithOthers', { others: others.join(', ') }));
  }
  return String(i18n.t('EventEndWinners_other', { winnerNames: ctx.winnerNames.join(', ') }));
}

export function buildEventEndEmailBody(ctx: EventEndMessageContext): string {
  const segments: string[] = [i18n.t('EventEndIntro', { eventName: ctx.eventName })];
  const winner = winnerLine(ctx);
  if (winner !== undefined) {
    segments.push(winner);
  }
  segments.push(i18n.t('EventEndLink', { eventId: ctx.eventId }));
  return segments.join(' ');
}

export function buildEventEndPushBody(ctx: EventEndMessageContext): string {
  const segments: string[] = [i18n.t('EventEndIntro', { eventName: ctx.eventName })];
  const winner = winnerLine(ctx);
  if (winner !== undefined) {
    segments.push(winner);
  }
  return segments.join(' ');
}

export function winnerDisplayNamesForNotification(
  winnerIds: string[],
  playersById: Map<string, { id: string; name: string }>,
): string[] {
  return winnerIds
    .map(id => playersById.get(id)?.name)
    .filter((name): name is string => name !== undefined && name !== '');
}
