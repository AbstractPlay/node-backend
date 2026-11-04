import {
  GameBase,
  GameBaseSimultaneous,
  GameFactory,
  guerrillaStateUsesMatchVariant,
  repairGuerrillaMatchStackJson,
  repairTableroStackJson,
} from '@abstractplay/gameslib';
import { gzipSync, gunzipSync } from 'zlib';
import { reconcileVariantsInGameState } from './resolveGameVariants.js';

function variantsFromEngine(metaGame: string, stateJson: string): string[] {
  const engine = GameFactory(metaGame, stateJson);
  if (engine === undefined || engine.variants === undefined || engine.variants.length === 0) {
    return [];
  }
  return [...new Set(engine.variants)].sort();
}

type GameEndedTarget = {
  gameEnded?: number;
  winner?: number[];
  gameStarted?: number;
};

export const GAME_STATE_COMPRESS_THRESHOLD_BYTES = 300_000;
/** DynamoDB item limit is 400KB; leave headroom for non-state attributes. */
export const GAME_STATE_MAX_STORED_BYTES = 390_000;

const COMPRESSED_PREFIX = 'gz:';

function stateByteLength(state: string): number {
  return Buffer.byteLength(state, 'utf8');
}

function isGzipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

export function isCompressedGameState(state: string): boolean {
  if (!state || state.startsWith('{') || state.startsWith('[')) {
    return false;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    return true;
  }
  try {
    const buf = Buffer.from(state, 'base64');
    return isGzipBuffer(buf);
  } catch {
    return false;
  }
}

function gunzipBase64(base64: string): string {
  return gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
}

export function decompressGameState(state: string): string {
  if (!state || state.startsWith('{') || state.startsWith('[')) {
    return state;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    return gunzipBase64(state.slice(COMPRESSED_PREFIX.length));
  }
  try {
    const buf = Buffer.from(state, 'base64');
    if (isGzipBuffer(buf)) {
      return gunzipSync(buf).toString('utf8');
    }
  } catch {
    // fall through
  }
  return state;
}

function gzipToPrefixedBase64(state: string): string {
  const compressed = gzipSync(Buffer.from(state, 'utf8'));
  return COMPRESSED_PREFIX + compressed.toString('base64');
}

function assertStoredStateSize(state: string): void {
  const bytes = stateByteLength(state);
  if (bytes > GAME_STATE_MAX_STORED_BYTES) {
    throw new Error(
      `Game state is ${bytes} bytes after compression (limit ${GAME_STATE_MAX_STORED_BYTES}); ` +
      'DynamoDB item would exceed the 400KB limit'
    );
  }
}

export function compressGameStateIfNeeded(state: string): string {
  if (isCompressedGameState(state)) {
    return state;
  }
  if (stateByteLength(state) <= GAME_STATE_COMPRESS_THRESHOLD_BYTES) {
    return state;
  }
  const compressed = gzipToPrefixedBase64(state);
  assertStoredStateSize(compressed);
  return compressed;
}

function reconcileGuerrillaMatchStackJson(
  stateJson: string,
  metaGame?: string,
  recordVariants?: string[],
): string {
  if (metaGame !== undefined && metaGame !== 'guerrilla') {
    return stateJson;
  }
  let parsed: { game?: string; variants?: string[] };
  try {
    parsed = JSON.parse(stateJson) as { game?: string; variants?: string[] };
  } catch {
    return stateJson;
  }
  if (parsed.game !== 'guerrilla') {
    return stateJson;
  }
  const variants = recordVariants !== undefined && recordVariants.length > 0
    ? recordVariants
    : parsed.variants;
  if (!guerrillaStateUsesMatchVariant(variants)) {
    return stateJson;
  }
  const { stateJson: repaired, repaired: didRepair } = repairGuerrillaMatchStackJson(stateJson);
  return didRepair ? repaired : stateJson;
}

function reconcileTableroStackJson(stateJson: string, metaGame?: string): string {
  if (metaGame !== undefined && metaGame !== 'tablero') {
    return stateJson;
  }
  let parsed: { game?: string };
  try {
    parsed = JSON.parse(stateJson) as { game?: string };
  } catch {
    return stateJson;
  }
  if (parsed.game !== 'tablero') {
    return stateJson;
  }
  const { stateJson: repaired, repaired: didRepair } = repairTableroStackJson(stateJson);
  return didRepair ? repaired : stateJson;
}

export function hydrateGameState<T extends { state: string; variants?: string[]; metaGame?: string }>(record: T): T {
  let state = decompressGameState(record.state);
  let variants = record.variants;

  if (variants !== undefined && variants.length > 0) {
    state = reconcileVariantsInGameState(state, variants);
  } else if (record.metaGame) {
    const fromEngine = variantsFromEngine(record.metaGame, state);
    if (fromEngine.length > 0) {
      variants = fromEngine;
      state = reconcileVariantsInGameState(state, variants);
    }
  }

  state = reconcileGuerrillaMatchStackJson(state, record.metaGame, variants);
  state = reconcileTableroStackJson(state, record.metaGame);

  if (state === record.state && variants === record.variants) {
    return record;
  }
  return {
    ...record,
    state,
    ...(variants !== undefined ? { variants } : {}),
  };
}

/** Canonical variant uids from a stored state blob (for ops backfills). */
export function resolveVariantFieldsForGameRecord(
  metaGame: string,
  storedState: string,
  recordVariants?: string[],
): { variants: string[]; stateJson: string } {
  let stateJson = decompressGameState(storedState);
  let variants = recordVariants ?? [];

  if (variants.length > 0) {
    stateJson = reconcileVariantsInGameState(stateJson, variants);
  } else {
    const fromEngine = variantsFromEngine(metaGame, stateJson);
    if (fromEngine.length > 0) {
      variants = fromEngine;
      stateJson = reconcileVariantsInGameState(stateJson, variants);
    }
  }

  return { variants, stateJson };
}

export function resolveVariantsForGameRecord(
  metaGame: string,
  storedState: string,
  recordVariants?: string[],
): { variants: string[]; stateJson: string } {
  const { variants, stateJson: variantJson } = resolveVariantFieldsForGameRecord(
    metaGame,
    storedState,
    recordVariants,
  );
  const stateJson = reconcileStackRepairsInStateJson(variantJson, metaGame, variants);
  return { variants, stateJson };
}

function metaGameFromStorageRecord(record: { metaGame?: string; state: string }): string | undefined {
  if (record.metaGame !== undefined && record.metaGame.length > 0) {
    return record.metaGame;
  }
  try {
    const parsed = JSON.parse(decompressGameState(record.state)) as { game?: string };
    return parsed.game;
  } catch {
    return undefined;
  }
}

function reconcileStackRepairsInStateJson(
  stateJson: string,
  metaGame: string,
  variants?: string[],
): string {
  let next = reconcileGuerrillaMatchStackJson(stateJson, metaGame, variants);
  next = reconcileTableroStackJson(next, metaGame);
  return next;
}

export function numMovesFromStateJson(metaGame: string, stateJson: string): number | undefined {
  try {
    const engine = GameFactory(metaGame, stateJson);
    if (engine) {
      return engine.stack.length - 1;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function prepareGameStateForStorage<
  T extends { state: string; metaGame?: string; variants?: string[]; numMoves?: number },
>(record: T): T {
  const decompressed = decompressGameState(record.state);
  const metaGame = metaGameFromStorageRecord(record);
  let stateJson = decompressed;
  if (metaGame !== undefined) {
    stateJson = reconcileStackRepairsInStateJson(stateJson, metaGame, record.variants);
  }

  let next: T = record;
  if (stateJson !== decompressed) {
    next = { ...next, state: stateJson };
  }

  if (metaGame !== undefined) {
    const stackMoves = numMovesFromStateJson(metaGame, stateJson);
    if (stackMoves !== undefined && next.numMoves !== stackMoves) {
      next = { ...next, numMoves: stackMoves };
    }
  }

  const compressed = compressGameStateIfNeeded(stateJson);
  if (compressed === record.state && next.numMoves === record.numMoves) {
    return record;
  }
  return { ...next, state: compressed };
}

export function hydratePlaygroundBody<T extends { body: string }>(record: T): T {
  const decompressed = decompressGameState(record.body);
  if (decompressed === record.body) {
    return record;
  }
  return { ...record, body: decompressed };
}

export function preparePlaygroundBodyForStorage<T extends { body: string }>(record: T): T {
  const compressed = compressGameStateIfNeeded(record.body);
  if (compressed === record.body) {
    return record;
  }
  return { ...record, body: compressed };
}

export function setGameEndedFromEngine(
  game: GameEndedTarget,
  engine: GameBase | GameBaseSimultaneous,
): void {
  if (!engine.gameover) {
    return;
  }
  game.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
  game.winner = engine.winner;
  if (game.gameStarted === undefined && engine.stack.length > 0) {
    game.gameStarted = new Date(engine.stack[0]._timestamp).getTime();
  }
}
