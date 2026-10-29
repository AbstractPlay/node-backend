export type ArenaFlagPayload = {
  metaGame: string;
  gameId: string;
  clockGeneration: number;
};

export type ArenaFlagGameSlice = {
  clockGeneration?: number;
};

export function parseArenaFlagPayload(raw: unknown): ArenaFlagPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.metaGame !== 'string' || o.metaGame === '') {
    return null;
  }
  if (typeof o.gameId !== 'string' || o.gameId === '') {
    return null;
  }
  if (typeof o.clockGeneration !== 'number' || !Number.isFinite(o.clockGeneration)) {
    return null;
  }
  return {
    metaGame: o.metaGame,
    gameId: o.gameId,
    clockGeneration: o.clockGeneration,
  };
}

/** Idempotency: late scheduler invocations after reschedule must no-op. */
export function shouldSkipArenaFlagWorker(
  payload: ArenaFlagPayload,
  game: ArenaFlagGameSlice | null | undefined,
): { skip: boolean; reason?: string } {
  if (!game) {
    return { skip: true, reason: 'game_not_found' };
  }
  if (game.clockGeneration === undefined) {
    return { skip: true, reason: 'missing_clock_generation' };
  }
  if (payload.clockGeneration !== game.clockGeneration) {
    return { skip: true, reason: 'stale_generation' };
  }
  return { skip: false };
}
