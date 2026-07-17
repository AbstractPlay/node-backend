import { gzipSync, gunzipSync } from 'zlib';

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

export function hydrateGameState<T extends { state: string }>(record: T): T {
  const decompressed = decompressGameState(record.state);
  if (decompressed === record.state) {
    return record;
  }
  return { ...record, state: decompressed };
}

export function prepareGameStateForStorage<T extends { state: string }>(record: T): T {
  const compressed = compressGameStateIfNeeded(record.state);
  if (compressed === record.state) {
    return record;
  }
  return { ...record, state: compressed };
}
