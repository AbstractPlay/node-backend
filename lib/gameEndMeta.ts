import { GameFactory } from '@abstractplay/gameslib';
import { decompressGameState } from './gameState.js';

export type GameEndKind = 'normal' | 'resign' | 'timeout' | 'abandoned' | 'draw';

export type GameEndMeta = {
  gameEndKind: GameEndKind;
  gameEndPlayer?: number;
  eogReason?: string;
};

type MoveResult = { type: string; player?: number; reason?: string };

type StackFrame = { _results?: MoveResult[] };

function finalStackResults(engine: { stack: StackFrame[] }): MoveResult[] {
  if (!engine.stack?.length) {
    return [];
  }
  return engine.stack[engine.stack.length - 1]._results ?? [];
}

function playerFromResults(results: MoveResult[], type: string): number | undefined {
  for (const r of results) {
    if (r.type === type && typeof r.player === 'number') {
      return r.player;
    }
  }
  return undefined;
}

function lastmoveImpliesKind(lastmove: string | undefined, token: string): boolean {
  if (lastmove === undefined || lastmove === '') {
    return false;
  }
  if (lastmove === token) {
    return true;
  }
  return lastmove.split(',').some((part) => part.trim() === token);
}

function eogReasonFromResults(results: MoveResult[]): string | undefined {
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const r = results[i];
    if (r.type === 'eog' && r.reason !== undefined && r.reason !== '') {
      return r.reason;
    }
  }
  return undefined;
}

/**
 * Classify how a completed game ended from persisted engine state.
 */
export function deriveGameEndMeta(metaGame: string, state: string): GameEndMeta | undefined {
  try {
    const json = decompressGameState(state);
    const engine = GameFactory(metaGame, json);
    if (engine === undefined || !engine.gameover) {
      return undefined;
    }

    const results = finalStackResults(engine);
    const lm = typeof engine.lastmove === 'string' ? engine.lastmove : undefined;

    if (lastmoveImpliesKind(lm, 'abandoned') || results.some((r) => r.type === 'gameabandoned')) {
      return { gameEndKind: 'abandoned' };
    }
    if (lastmoveImpliesKind(lm, 'draw') || results.some((r) => r.type === 'drawagreed')) {
      return { gameEndKind: 'draw' };
    }
    if (lastmoveImpliesKind(lm, 'resign') || results.some((r) => r.type === 'resigned')) {
      const gameEndPlayer = playerFromResults(results, 'resigned');
      return gameEndPlayer !== undefined
        ? { gameEndKind: 'resign', gameEndPlayer }
        : { gameEndKind: 'resign' };
    }
    if (lastmoveImpliesKind(lm, 'timeout') || results.some((r) => r.type === 'timeout')) {
      const gameEndPlayer = playerFromResults(results, 'timeout');
      return gameEndPlayer !== undefined
        ? { gameEndKind: 'timeout', gameEndPlayer }
        : { gameEndKind: 'timeout' };
    }

    const eogReason = eogReasonFromResults(results);
    return eogReason !== undefined
      ? { gameEndKind: 'normal', eogReason }
      : { gameEndKind: 'normal' };
  } catch {
    return undefined;
  }
}

export function gameEndFieldsFromState(
  metaGame: string,
  state: string,
): Pick<GameEndMeta, 'gameEndKind' | 'gameEndPlayer' | 'eogReason'> | undefined {
  const meta = deriveGameEndMeta(metaGame, state);
  if (meta === undefined) {
    return undefined;
  }
  return {
    gameEndKind: meta.gameEndKind,
    ...(meta.gameEndPlayer !== undefined ? { gameEndPlayer: meta.gameEndPlayer } : {}),
    ...(meta.eogReason !== undefined ? { eogReason: meta.eogReason } : {}),
  };
}
