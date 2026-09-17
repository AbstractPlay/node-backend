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
  const copy: SeatChallenge = {
    ...challenge,
    players: [...(challenge.players ?? [])],
    challengees: [...(challenge.challengees ?? [])],
    openSlots: effectiveOpenSlots(challenge),
  };

  if (shouldFullRemoveOnLeave(copy)) {
    return { challenge: copy, mode: 'full' };
  }

  if (copy.numPlayers <= 2) {
    return { challenge: copy, mode: 'full' };
  }

  const wasInChallengees = copy.challengees!.some(c => c.id === quitterId);
  const wasInPlayers =
    quitterId !== copy.challenger.id && copy.players!.some(p => p.id === quitterId);

  if (wasInChallengees) {
    copy.challengees = copy.challengees!.filter(c => c.id !== quitterId);
    if (!copy.standing) {
      copy.openSlots = effectiveOpenSlots(copy) + 1;
    }
    return { challenge: copy, mode: 'partial' };
  }

  if (wasInPlayers) {
    copy.players = copy.players!.filter(p => p.id !== quitterId);
    if (!copy.standing) {
      copy.openSlots = effectiveOpenSlots(copy) + 1;
    }
    return { challenge: copy, mode: 'partial' };
  }

  return { challenge: copy, mode: 'full' };
}
