export type StandingPresetEntry = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  sensitivity: 'meta' | 'variants';
  suspended: boolean;
};

export type ChallengeForStandingMatch = {
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
};

export function stringArraysEqual(lst1: string[], lst2: string[]): boolean {
  if (lst1.length !== lst2.length) {
    return false;
  }
  const s1 = [...lst1].sort((a, b) => a.localeCompare(b));
  const s2 = [...lst2].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) {
      return false;
    }
  }
  return true;
}

export function challengeMatchesStandingEntry(
  challenge: ChallengeForStandingMatch,
  entry: StandingPresetEntry,
): boolean {
  if (challenge.metaGame !== entry.metaGame) {
    return false;
  }
  if (challenge.numPlayers !== entry.numPlayers) {
    return false;
  }
  if (challenge.clockStart !== entry.clockStart) {
    return false;
  }
  if (challenge.clockInc !== entry.clockInc) {
    return false;
  }
  if (challenge.clockMax !== entry.clockMax) {
    return false;
  }
  if (challenge.clockHard !== entry.clockHard) {
    return false;
  }
  if (challenge.rated !== entry.rated) {
    return false;
  }
  if ((challenge.noExplore ?? false) !== (entry.noExplore ?? false)) {
    return false;
  }
  if (entry.sensitivity === 'variants') {
    return stringArraysEqual(challenge.variants ?? [], entry.variants ?? []);
  }
  return true;
}
