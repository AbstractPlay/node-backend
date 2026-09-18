import type { User } from '../api/types.js';

export type SeatChallenge = {
  numPlayers: number;
  standing?: boolean;
  challenger: User;
  players?: User[];
  challengees?: User[];
  openSlots?: number;
};

export function effectiveOpenSlots(challenge: { openSlots?: number }): number {
  return challenge.openSlots ?? 0;
}

/** Each user id may appear at most once across players and challengees (challenger may appear once in players). */
export function validateChallengeParticipantUniqueness(
  challenge: SeatChallenge,
): string | undefined {
  const challengerId = challenge.challenger?.id;
  if (!challengerId) {
    return 'Challenge missing challenger';
  }

  const playerIds = (challenge.players ?? []).map(p => p.id);
  if (new Set(playerIds).size !== playerIds.length) {
    return 'A player may only appear once in a challenge';
  }

  const challengeeIds = (challenge.challengees ?? []).map(c => c.id);
  if (new Set(challengeeIds).size !== challengeeIds.length) {
    return 'Duplicate named opponents';
  }

  if (challengeeIds.includes(challengerId)) {
    return 'Challenger cannot also be a named opponent';
  }

  const seated = new Set(playerIds);
  for (const id of challengeeIds) {
    if (seated.has(id)) {
      return 'A player cannot be both invited and seated';
    }
  }

  return undefined;
}

/** Reject joining when the user already occupies a seat or the record is corrupt. */
export function assertCanJoinChallenge(
  challenge: SeatChallenge,
  userid: string,
): string | undefined {
  const uniqErr = validateChallengeParticipantUniqueness(challenge);
  if (uniqErr) {
    return uniqErr;
  }
  if (challenge.players?.some(p => p.id === userid)) {
    return 'Already in this challenge';
  }
  return undefined;
}

export function seatInvariantHolds(challenge: SeatChallenge): boolean {
  const players = challenge.players?.length ?? 0;
  const challengees = challenge.challengees?.length ?? 0;
  const open = effectiveOpenSlots(challenge);
  return players + challengees + open === challenge.numPlayers;
}

/** Direct closed challenge seat layout at issue (challenger already in players). */
export function validateDirectChallengeSeats(
  numPlayers: number,
  challengees: User[],
  openSlots: number,
): string | undefined {
  if (numPlayers <= 2) {
    if (openSlots !== 0) {
      return 'Two-player direct challenges cannot have open slots';
    }
    if (challengees.length !== 1) {
      return 'Two-player direct challenges require exactly one opponent';
    }
    return undefined;
  }
  if (challengees.length < 1) {
    return 'Closed challenges require at least one named opponent';
  }
  if (openSlots === numPlayers - 1) {
    return 'Use an open challenge when all seats are open to anyone';
  }
  const playersCount = 1;
  if (playersCount + challengees.length + openSlots !== numPlayers) {
    return 'Invalid seat layout for player count';
  }
  const ids = new Set(challengees.map(c => c.id));
  if (ids.size !== challengees.length) {
    return 'Duplicate named opponents';
  }
  return undefined;
}

export function shouldFullRemoveOnLeave(challenge: SeatChallenge): boolean {
  return challenge.standing !== true && challenge.numPlayers === 2;
}

export type SeatLeaveMode = 'full' | 'partial';

export type SeatLeaveResult = {
  challenge: SeatChallenge;
  mode: SeatLeaveMode;
};

export function applySeatLeave(challenge: SeatChallenge, quitterId: string): SeatLeaveResult {
  const players = [...(challenge.players ?? [])];
  const challengees = [...(challenge.challengees ?? [])];
  const copy: SeatChallenge = {
    ...challenge,
    players,
    challengees,
    openSlots: effectiveOpenSlots(challenge),
  };

  if (shouldFullRemoveOnLeave(copy)) {
    return { challenge: copy, mode: 'full' };
  }

  if (copy.numPlayers <= 2) {
    return { challenge: copy, mode: 'full' };
  }

  const wasInChallengees = challengees.some(c => c.id === quitterId);
  const challengerCopiesInPlayers = players.filter(p => p.id === quitterId).length;
  const wasInPlayers =
    players.some(p => p.id === quitterId)
    && (quitterId !== copy.challenger.id || challengerCopiesInPlayers > 1);

  if (wasInChallengees) {
    copy.challengees = challengees.filter(c => c.id !== quitterId);
    if (!copy.standing) {
      copy.openSlots = effectiveOpenSlots(copy) + 1;
    }
    return { challenge: copy, mode: 'partial' };
  }

  if (wasInPlayers) {
    if (quitterId === copy.challenger.id && challengerCopiesInPlayers > 1) {
      let seenChallenger = false;
      copy.players = players.filter((p) => {
        if (p.id !== quitterId) {
          return true;
        }
        if (!seenChallenger) {
          seenChallenger = true;
          return true;
        }
        return false;
      });
    } else {
      copy.players = players.filter(p => p.id !== quitterId);
    }
    if (!copy.standing) {
      copy.openSlots = effectiveOpenSlots(copy) + 1;
    }
    return { challenge: copy, mode: 'partial' };
  }

  return { challenge: copy, mode: 'full' };
}
