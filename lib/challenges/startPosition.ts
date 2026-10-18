import { gameinfo, GameFactory, type GameBase } from '@abstractplay/gameslib';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  compressGameStateIfNeeded,
  decompressGameState,
  hydrateGameState,
} from '../gameState.js';
import { reconcileVariantsInGameState } from '../resolveGameVariants.js';
import { validateTeachingChallengeSync } from './teachingModeEligible.js';

export const CHALLENGE_POSITION_PK = 'CHALLENGEPOSITION';

export type StartPositionInput = {
  state?: string;
};

export type ChallengeWithStartPosition = {
  metaGame: string;
  numPlayers: number;
  standing?: boolean;
  openSlots?: number;
  variants?: string[];
  teachingMode?: boolean;
  rated: boolean;
  startPosition?: StartPositionInput;
};

export type ResolvedChallengeStart = {
  state: string;
  toMove: string | boolean[];
  engineVariants: string[];
  engine: GameBase;
};

export function hasStartPositionPayload(
  challenge: { startPosition?: StartPositionInput },
): boolean {
  return typeof challenge.startPosition?.state === 'string'
    && challenge.startPosition.state.length > 0;
}

/** When `startPosition` is set, force teaching mode and unrated. */
export function normalizeStartPositionChallengeFields(challenge: ChallengeWithStartPosition): void {
  if (!hasStartPositionPayload(challenge)) {
    return;
  }
  challenge.teachingMode = true;
  challenge.rated = false;
}

/** Issue-time rules that apply only when `startPosition` is present. */
export function validateStartPositionChallengeShape(
  challenge: ChallengeWithStartPosition,
): string | null {
  if (!hasStartPositionPayload(challenge)) {
    return null;
  }
  if (challenge.numPlayers !== 2) {
    return 'Start position challenges are only available for two-player games.';
  }
  if (challenge.standing === true) {
    return 'Start position cannot be used on open or standing challenges.';
  }
  const openSlots = challenge.openSlots ?? 0;
  if (openSlots > 0) {
    return 'Start position challenges cannot include open seats.';
  }
  return null;
}

export function validateStartPositionForIssue(
  metaGame: string,
  numPlayers: number,
  variants: string[] | undefined,
  state: string,
): string | null {
  if (typeof state !== 'string' || state.trim() === '') {
    return 'Start position state is required.';
  }
  const teachingErr = validateTeachingChallengeSync(metaGame, numPlayers, variants);
  if (teachingErr) {
    return teachingErr;
  }
  let stateJson = state;
  if (variants !== undefined && variants.length > 0) {
    try {
      stateJson = reconcileVariantsInGameState(state, variants);
    } catch {
      return 'Start position state does not match the selected variants.';
    }
  }
  const engine = GameFactory(metaGame, stateJson);
  if (!engine) {
    return `Unknown metaGame: ${metaGame}`;
  }
  if (engine.gameover === true) {
    return 'Start position cannot be a finished game.';
  }
  const info = gameinfo.get(metaGame);
  if (info?.flags !== undefined && info.flags.includes('simultaneous')) {
    return 'Start position is not available for simultaneous games.';
  }
  try {
    prepareChallengePositionState(stateJson);
  } catch (err) {
    return err instanceof Error ? err.message : 'Start position state is too large.';
  }
  return null;
}

export function prepareChallengePositionState(state: string): string {
  const compressed = compressGameStateIfNeeded(state);
  return compressed;
}

export function resolveStartFromPosition(
  metaGame: string,
  variants: string[] | undefined,
  storedState: string,
): ResolvedChallengeStart {
  const hydrated = hydrateGameState({
    metaGame,
    variants,
    state: storedState,
  });
  const engine = GameFactory(metaGame, hydrated.state);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  const info = gameinfo.get(metaGame);
  if (!info) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  let whoseTurn: string | boolean[] = '0';
  if (info.flags !== undefined && info.flags.includes('simultaneous')) {
    const count = typeof engine.numplayers === 'number' ? engine.numplayers : 2;
    whoseTurn = Array.from({ length: count }, () => true);
  } else if (typeof engine.currplayer === 'number') {
    whoseTurn = `${engine.currplayer - 1}`;
  }
  const engineVariants =
    engine.variants !== undefined && engine.variants.length > 0
      ? [...engine.variants]
      : (variants ?? []);
  return {
    state: hydrated.state,
    toMove: whoseTurn,
    engineVariants,
    engine,
  };
}

export type ChallengePositionRecord = {
  pk: string;
  sk: string;
  state: string;
  variants?: string[];
};

export async function putChallengePosition(
  client: DynamoDBDocumentClient,
  tableName: string,
  challengeId: string,
  state: string,
  variants?: string[],
): Promise<void> {
  const storedState = prepareChallengePositionState(state);
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: CHALLENGE_POSITION_PK,
        sk: challengeId,
        state: storedState,
        ...(variants !== undefined && variants.length > 0 ? { variants } : {}),
      },
    }),
  );
}

export async function getChallengePosition(
  client: DynamoDBDocumentClient,
  tableName: string,
  challengeId: string,
): Promise<ChallengePositionRecord | undefined> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: CHALLENGE_POSITION_PK, sk: challengeId },
    }),
  );
  if (result.Item === undefined) {
    return undefined;
  }
  const item = result.Item as ChallengePositionRecord;
  return {
    ...item,
    state: decompressGameState(item.state),
  };
}

export async function deleteChallengePosition(
  client: DynamoDBDocumentClient,
  tableName: string,
  challengeId: string,
): Promise<void> {
  await client.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk: CHALLENGE_POSITION_PK, sk: challengeId },
    }),
  );
}
