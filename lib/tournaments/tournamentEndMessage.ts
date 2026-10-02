import i18n from '../i18nInstance.js';
import type { DivisionStandingRow, DivisionStandingsResult } from './divisionStandings.js';

export const TOURNAMENT_SIGNUP_MIN_PLAYERS = 4;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ONE_WEEK_MS = MS_PER_DAY * 7;
const TWO_WEEKS_MS = ONE_WEEK_MS * 2;

export type TournamentEndMessageContext = {
  metaGameName: string;
  number: number;
  tournamentId: string;
  variants: string[];
  recipientUserId: string;
  standings?: DivisionStandingsResult;
  nextSignup?: {
    daysUntilEarliestStart: number;
    signupCount: number;
    registeredForNext: boolean;
  };
};

function introKey(variants: string[]): string {
  return variants.length === 0 ? 'TournamentEndIntro' : 'TournamentEndIntroVariants';
}

function introParams(ctx: TournamentEndMessageContext): Record<string, unknown> {
  const base = { metaGame: ctx.metaGameName, number: ctx.number };
  if (ctx.variants.length === 0) {
    return base;
  }
  return { ...base, variants: ctx.variants.join(', ') };
}

function winnerLine(ctx: TournamentEndMessageContext): string | undefined {
  const winnerId = ctx.standings?.winnerId;
  const winnerName = ctx.standings?.winnerName;
  if (!winnerId || !winnerName) {
    return undefined;
  }
  const context = winnerId === ctx.recipientUserId ? 'you' : 'other';
  return String(i18n.t('TournamentEndWinner', { context, winnerName }));
}

function nextSignupLine(ctx: TournamentEndMessageContext): string | undefined {
  const next = ctx.nextSignup;
  if (next === undefined) {
    return undefined;
  }
  const count = Math.max(0, next.daysUntilEarliestStart);
  const parts = [
    i18n.t('TournamentEndNextSignup', {
      count,
      minSignups: TOURNAMENT_SIGNUP_MIN_PLAYERS,
      signupCount: next.signupCount,
    }),
  ];
  if (next.registeredForNext) {
    parts.push(i18n.t('TournamentEndNextSignupRegistered'));
  }
  return parts.join(' ');
}

export function formatDivisionStandingsPlainText(ranked: DivisionStandingRow[]): string {
  const lines: string[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const row = ranked[i]!;
    const points = Number.isInteger(row.score) ? String(row.score) : String(row.score);
    lines.push(`${i + 1}. ${row.playername} — ${points}`);
  }
  return lines.join('\n');
}

export function computeEarliestNextTournamentStartMs(
  dateCreated: number,
  datePreviousEnded: number,
): number {
  return Math.max(dateCreated + TWO_WEEKS_MS, datePreviousEnded + ONE_WEEK_MS);
}

export function daysUntilFromNow(earliestStartMs: number, now: number): number {
  if (earliestStartMs <= now) {
    return 0;
  }
  return Math.ceil((earliestStartMs - now) / MS_PER_DAY);
}

export function buildTournamentEndEmailBody(ctx: TournamentEndMessageContext): string {
  const segments: string[] = [i18n.t(introKey(ctx.variants), introParams(ctx))];
  const winner = winnerLine(ctx);
  if (winner !== undefined) {
    segments.push(winner);
  }
  if (ctx.standings !== undefined && ctx.standings.ranked.length > 0) {
    segments.push(i18n.t('TournamentEndStandingsHeader'));
    segments.push(formatDivisionStandingsPlainText(ctx.standings.ranked));
  }
  segments.push(i18n.t('TournamentEndLink', { tournamentId: ctx.tournamentId }));
  const nextLine = nextSignupLine(ctx);
  if (nextLine !== undefined) {
    segments.push(nextLine);
  }
  return segments.join(' ');
}

export function buildTournamentEndPushBody(ctx: TournamentEndMessageContext): string {
  const segments: string[] = [];
  const winner = winnerLine(ctx);
  if (winner !== undefined) {
    segments.push(winner);
  }
  const nextLine = nextSignupLine(ctx);
  if (nextLine !== undefined) {
    segments.push(nextLine);
  }
  return segments.join(' ');
}
