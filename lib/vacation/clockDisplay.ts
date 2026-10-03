import {
  isPlayerOnClock,
  remainingBankMs,
  type ClockGameSlice,
} from '../clockElapsed.js';
import type { DashboardGame } from '../dashboardGames.js';
import type { PlayerVacationDisplayFlags } from './load.js';
import type { GetVacationWindowFn } from './persist.js';
import type { VacationWindow } from './types.js';

export type PlayerClockDisplayFields = {
  effectiveRemainingMs?: number;
  clockPaused?: boolean;
  onVacation?: boolean;
  vacationScheduled?: boolean;
};

export type GameClockDisplayFields = {
  clockDisplayServerTime?: number;
};

const EMPTY_VACATION_FLAGS: PlayerVacationDisplayFlags = {
  onVacation: false,
  vacationScheduled: false,
};

function isClockPaused(now: number, window: VacationWindow | null): boolean {
  if (window === null) {
    return false;
  }
  return now >= window.pauseStart && now < window.pauseEnd;
}

function playerDisplayFields(
  game: ClockGameSlice,
  playerIndex: number,
  now: number,
  getVacationWindow: GetVacationWindowFn,
): Pick<PlayerClockDisplayFields, 'effectiveRemainingMs' | 'clockPaused'> | undefined {
  if (!isPlayerOnClock(game, playerIndex)) {
    return undefined;
  }
  const player = game.players[playerIndex];
  if (!player) {
    return undefined;
  }
  const bank = player.time ?? 0;
  const window = getVacationWindow(player.id);
  const effectiveRemainingMs = Math.max(
    0,
    remainingBankMs(bank, game.lastMoveTime, now, player.id, game, window),
  );
  return {
    effectiveRemainingMs,
    clockPaused: isClockPaused(now, window),
  };
}

export type GetPlayerVacationFlagsFn = (playerId: string) => PlayerVacationDisplayFlags;

export function enrichClockGameSlice<T extends ClockGameSlice>(
  game: T,
  now: number,
  getVacationWindow: GetVacationWindowFn,
  getPlayerVacationFlags: GetPlayerVacationFlagsFn = () => EMPTY_VACATION_FLAGS,
): T & GameClockDisplayFields & {
  players: (T['players'][number] & PlayerClockDisplayFields)[];
} {
  const slice: ClockGameSlice = {
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
  };
  const players = game.players.map((p, i) => {
    const vacation = getPlayerVacationFlags(p.id);
    const display = playerDisplayFields(slice, i, now, getVacationWindow);
    return {
      ...p,
      onVacation: vacation.onVacation,
      vacationScheduled: vacation.vacationScheduled,
      ...display,
    };
  });
  return {
    ...game,
    players,
    clockDisplayServerTime: now,
  };
}

export function enrichDashboardGamesClockDisplay(
  games: DashboardGame[],
  now: number,
  getVacationWindow: GetVacationWindowFn,
  getPlayerVacationFlags: GetPlayerVacationFlagsFn = () => EMPTY_VACATION_FLAGS,
): DashboardGame[] {
  return games.map((game) => {
    if (!game.lastMoveTime || game.toMove === '' || game.toMove === undefined) {
      return game;
    }
    return enrichClockGameSlice(game, now, getVacationWindow, getPlayerVacationFlags);
  });
}

export type GameWithPlayersAndClock = ClockGameSlice & {
  players: { id: string; name: string; time?: number }[];
  clockHard?: boolean;
};

export function enrichLiveGameClockDisplay<G extends GameWithPlayersAndClock>(
  game: G,
  now: number,
  getVacationWindow: GetVacationWindowFn,
  getPlayerVacationFlags: GetPlayerVacationFlagsFn = () => EMPTY_VACATION_FLAGS,
): G & GameClockDisplayFields & {
  players: (G['players'][number] & PlayerClockDisplayFields)[];
} {
  if (
    game.lastMoveTime === undefined
    || game.toMove === ''
    || game.toMove === undefined
    || game.toMove === null
  ) {
    return game as G & GameClockDisplayFields;
  }
  return enrichClockGameSlice(
    {
      players: game.players,
      toMove: game.toMove,
      lastMoveTime: game.lastMoveTime,
    },
    now,
    getVacationWindow,
    getPlayerVacationFlags,
  ) as G & GameClockDisplayFields & {
    players: (G['players'][number] & PlayerClockDisplayFields)[];
  };
}
