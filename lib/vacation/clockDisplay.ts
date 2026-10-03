import {
  isPlayerOnClock,
  remainingBankMs,
  type ClockGameSlice,
} from '../clockElapsed.js';
import type { DashboardGame } from '../dashboardGames.js';
import type { GetVacationWindowFn } from './persist.js';
import type { VacationWindow } from './types.js';

export type PlayerClockDisplayFields = {
  effectiveRemainingMs?: number;
  clockPaused?: boolean;
};

export type GameClockDisplayFields = {
  clockDisplayServerTime?: number;
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
): PlayerClockDisplayFields | undefined {
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

export function enrichClockGameSlice<T extends ClockGameSlice>(
  game: T,
  now: number,
  getVacationWindow: GetVacationWindowFn,
): T & GameClockDisplayFields & {
  players: (T['players'][number] & PlayerClockDisplayFields)[];
} {
  const slice: ClockGameSlice = {
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
  };
  const players = game.players.map((p, i) => {
    const display = playerDisplayFields(slice, i, now, getVacationWindow);
    if (!display) {
      return { ...p };
    }
    return { ...p, ...display };
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
): DashboardGame[] {
  return games.map((game) => {
    if (!game.lastMoveTime || game.toMove === '' || game.toMove === undefined) {
      return game;
    }
    return enrichClockGameSlice(game, now, getVacationWindow);
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
  ) as G & GameClockDisplayFields & {
    players: (G['players'][number] & PlayerClockDisplayFields)[];
  };
}
