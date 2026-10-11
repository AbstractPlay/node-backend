import { gameinfo, GameFactory, type GameBase } from '@abstractplay/gameslib';
import { flagSetIncludes, structuralFlags } from '../effectiveGameFlags.js';
import { isBotId } from '../participants.js';

const ALLOWED_TURN_MODELS = new Set(['sequential', 'sequenced', 'skip-turn']);

type TeachingChallengeFields = {
  teachingMode?: boolean;
  rated: boolean;
};

export function normalizeTeachingChallengeFields(challenge: TeachingChallengeFields): void {
  if (challenge.teachingMode === true) {
    challenge.rated = false;
  }
}

function engineForChallenge(
  metaGame: string,
  numPlayers: number,
  variants?: string[],
): GameBase | undefined {
  const info = gameinfo.get(metaGame);
  if (!info) {
    return undefined;
  }
  if (info.playercounts.length > 1) {
    return GameFactory(metaGame, numPlayers, variants) as GameBase | undefined;
  }
  return GameFactory(metaGame, undefined, variants) as GameBase | undefined;
}

/** Synchronous eligibility checks for teaching mode (no bot / participant lookups). */
export function validateTeachingChallengeSync(
  metaGame: string,
  numPlayers: number,
  variants?: string[],
): string | null {
  if (numPlayers !== 2) {
    return 'Teaching mode is only available for two-player games.';
  }
  if (flagSetIncludes(structuralFlags(metaGame), 'simultaneous')) {
    return 'Teaching mode is not available for simultaneous games.';
  }
  const engine = engineForChallenge(metaGame, numPlayers, variants);
  if (!engine) {
    return `Unknown metaGame: ${metaGame}`;
  }
  const turnModel =
    typeof engine.turnModel === 'function' ? engine.turnModel() : 'sequential';
  if (turnModel === 'simultaneous') {
    return 'Teaching mode is not available for simultaneous games.';
  }
  if (!ALLOWED_TURN_MODELS.has(turnModel)) {
    return 'Teaching mode is not available for this turn model.';
  }
  return null;
}

type ChallengeParticipants = {
  teachingMode?: boolean;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  challenger: { id: string };
  challengees?: { id: string }[];
};

/** Full issue-time validation including bots. Returns a user-facing message or null. */
export async function validateTeachingChallengeIssue(
  challenge: ChallengeParticipants,
): Promise<string | null> {
  if (challenge.teachingMode !== true) {
    return null;
  }
  const syncErr = validateTeachingChallengeSync(
    challenge.metaGame,
    challenge.numPlayers,
    challenge.variants,
  );
  if (syncErr) {
    return syncErr;
  }
  if (await isBotId(challenge.challenger.id)) {
    return 'Teaching mode challenges cannot include bot players.';
  }
  for (const challengee of challenge.challengees ?? []) {
    if (await isBotId(challengee.id)) {
      return 'Teaching mode challenges cannot include bot opponents.';
    }
  }
  return null;
}
