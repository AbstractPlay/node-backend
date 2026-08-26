import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, type GameBase } from '@abstractplay/gameslib';

export type SoloClockOptions = {
  clockStart?: number;
  clockInc?: number;
  clockMax?: number;
  clockHard?: boolean;
};

export type StartSoloGameInput = {
  metaGame: string;
  variants?: string[];
  challengeSeed?: string;
  noExplore?: boolean;
} & SoloClockOptions;

export type StartSoloGameResult = {
  gameId: string;
  metaGame: string;
  challengeSeed: string;
  state: string;
  variants?: string[];
  engine: GameBase;
};

/** Whether the title supports `numPlayers === 1`. */
export const soloPlaySupported = (metaGame: string): boolean => {
  const info = gameinfo.get(metaGame);
  return info !== undefined && info.playercounts.includes(1);
};

/** Assign a concrete seed before play (client-provided or server-generated). */
export const resolveChallengeSeed = (provided?: string): string => {
  if (provided !== undefined && provided.trim().length > 0) {
    return provided.trim();
  }
  return uuid();
};

type SoloCapableEngine = GameBase & {
  initRng?: (seed: string) => void;
};

/** Instantiate a fresh 1-player engine and seed RNG when the game supports it. */
export const createSoloEngine = (
  metaGame: string,
  variants: string[] | undefined,
  challengeSeed: string,
): GameBase => {
  const info = gameinfo.get(metaGame);
  if (info === undefined) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  if (!info.playercounts.includes(1)) {
    throw new Error(`Game ${metaGame} does not support solo play`);
  }

  let engine: GameBase | undefined;
  if (info.playercounts.length > 1) {
    engine = GameFactory(metaGame, 1, variants) as GameBase | undefined;
  } else {
    engine = GameFactory(metaGame, undefined, variants) as GameBase | undefined;
  }
  if (engine === undefined) {
    throw new Error(`Could not instantiate ${metaGame}`);
  }

  const soloEngine = engine as SoloCapableEngine;
  if (typeof soloEngine.initRng === 'function') {
    soloEngine.initRng(challengeSeed);
  }

  return engine;
};

const DEFAULT_SOLO_CLOCK: Required<SoloClockOptions> = {
  clockStart: 72,
  clockInc: 0,
  clockMax: 72,
  clockHard: false,
};

export const normalizeSoloClocks = (opts: SoloClockOptions = {}): Required<SoloClockOptions> => ({
  clockStart: opts.clockStart ?? DEFAULT_SOLO_CLOCK.clockStart,
  clockInc: opts.clockInc ?? DEFAULT_SOLO_CLOCK.clockInc,
  clockMax: opts.clockMax ?? DEFAULT_SOLO_CLOCK.clockMax,
  clockHard: opts.clockHard ?? DEFAULT_SOLO_CLOCK.clockHard,
});

/** Prepare engine + ids for persisting a new solo GAME item. */
export const buildStartSoloGame = (input: StartSoloGameInput): StartSoloGameResult => {
  const challengeSeed = resolveChallengeSeed(input.challengeSeed);
  const engine = createSoloEngine(input.metaGame, input.variants, challengeSeed);
  return {
    gameId: uuid(),
    metaGame: input.metaGame,
    challengeSeed,
    state: engine.serialize(),
    variants: engine.variants,
    engine,
  };
};
