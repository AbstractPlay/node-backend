import { hasRegisteredDisplayName } from './userDisplayName.js';

export type AbandonedAccountDumpCandidate = {
  userId: string;
  lastSeen: number;
  name: string;
  wouldDeferOpenChallenge?: boolean;
};

export type AbandonedAccountDumpSummary = {
  inactiveBeforeMs: number;
  registeredHumans: number;
  inactiveRegistered: number;
  blockedCompleted: number;
  blockedCurrent: number;
  blockedGameRow: number;
  gameBlockedUnique: number;
  candidates: number;
  wouldDeferOpenChallenge: number;
};

export type AbandonedAccountDumpResult = {
  summary: AbandonedAccountDumpSummary;
  candidates: AbandonedAccountDumpCandidate[];
};

export type AbandonedAccountDumpCollectorState = {
  botIds: Set<string>;
  userById: Map<string, { lastSeen?: number; admin?: boolean }>;
  usersNameById: Map<string, string>;
  blockedCompleted: Set<string>;
  blockedCurrent: Set<string>;
  blockedGameRow: Set<string>;
  openChallengeUserIds: Set<string>;
  realStandingUserIds: Set<string>;
};

export function createAbandonedAccountDumpCollector(): AbandonedAccountDumpCollectorState {
  return {
    botIds: new Set(),
    userById: new Map(),
    usersNameById: new Map(),
    blockedCompleted: new Set(),
    blockedCurrent: new Set(),
    blockedGameRow: new Set(),
    openChallengeUserIds: new Set(),
    realStandingUserIds: new Set(),
  };
}

function playerIdsFromGameItem(item: Record<string, unknown>): string[] {
  const players = item.players;
  if (!Array.isArray(players)) {
    return [];
  }
  const ids: string[] = [];
  for (const p of players) {
    if (p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string') {
      ids.push((p as { id: string }).id);
    }
  }
  return ids;
}

function trackOpenChallengeUsers(item: Record<string, unknown>, state: AbandonedAccountDumpCollectorState): void {
  const challenger = item.challenger;
  if (challenger && typeof challenger === 'object' && typeof (challenger as { id?: unknown }).id === 'string') {
    state.openChallengeUserIds.add((challenger as { id: string }).id);
  }
  const challengees = item.challengees;
  if (Array.isArray(challengees)) {
    for (const c of challengees) {
      if (c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string') {
        state.openChallengeUserIds.add((c as { id: string }).id);
      }
    }
  }
}

/** Process one Dynamo Item from an ION export (pk/sk fields). */
export function processAbandonedAccountDumpItem(
  state: AbandonedAccountDumpCollectorState,
  item: Record<string, unknown>,
): void {
  const pk = item.pk;
  const sk = item.sk;
  if (typeof pk !== 'string' || typeof sk !== 'string') {
    return;
  }

  if (pk === 'BOT') {
    state.botIds.add(sk);
    return;
  }

  if (pk === 'USER') {
    state.userById.set(sk, {
      lastSeen: typeof item.lastSeen === 'number' ? item.lastSeen : undefined,
      admin: item.admin === true,
    });
    return;
  }

  if (pk === 'USERS') {
    if (typeof item.name === 'string') {
      state.usersNameById.set(sk, item.name);
    }
    return;
  }

  if (pk === 'REALSTANDING') {
    state.realStandingUserIds.add(sk);
    state.openChallengeUserIds.add(sk);
    return;
  }

  if (pk === 'CHALLENGE' || pk.startsWith('STANDINGCHALLENGE#')) {
    trackOpenChallengeUsers(item, state);
    return;
  }

  if (pk.startsWith('COMPLETEDGAMES#')) {
    const suffix = pk.slice('COMPLETEDGAMES#'.length);
    if (suffix && suffix !== 'COMPLETEDGAMES') {
      state.blockedCompleted.add(suffix);
    }
    return;
  }

  if (pk.startsWith('CURRENTGAMES#')) {
    const userId = pk.slice('CURRENTGAMES#'.length);
    if (userId) {
      state.blockedCurrent.add(userId);
    }
    return;
  }

  if (pk === 'GAME') {
    for (const id of playerIdsFromGameItem(item)) {
      state.blockedGameRow.add(id);
    }
  }
}

function registeredHumanIds(state: AbandonedAccountDumpCollectorState): string[] {
  const ids: string[] = [];
  for (const [userId, name] of state.usersNameById) {
    if (!hasRegisteredDisplayName(name)) {
      continue;
    }
    if (state.botIds.has(userId)) {
      continue;
    }
    const user = state.userById.get(userId);
    if (user?.admin === true) {
      continue;
    }
    ids.push(userId);
  }
  return ids;
}

export function finalizeAbandonedAccountDumpCandidates(
  state: AbandonedAccountDumpCollectorState,
  inactiveBeforeMs: number,
  opts?: { trackOpenChallengeDefer?: boolean },
): AbandonedAccountDumpResult {
  const trackDefer = opts?.trackOpenChallengeDefer ?? false;
  const humans = registeredHumanIds(state);
  const inactiveRegistered: string[] = [];
  for (const userId of humans) {
    const lastSeen = state.userById.get(userId)?.lastSeen;
    if (typeof lastSeen !== 'number' || lastSeen >= inactiveBeforeMs) {
      continue;
    }
    inactiveRegistered.push(userId);
  }

  const humanSet = new Set(humans);
  const gameBlocked = new Set<string>();
  let blockedCompleted = 0;
  let blockedCurrent = 0;
  let blockedGameRow = 0;

  for (const userId of inactiveRegistered) {
    let blocked = false;
    if (state.blockedCompleted.has(userId) && humanSet.has(userId)) {
      blockedCompleted += 1;
      blocked = true;
    }
    if (state.blockedCurrent.has(userId)) {
      blockedCurrent += 1;
      blocked = true;
    }
    if (state.blockedGameRow.has(userId)) {
      blockedGameRow += 1;
      blocked = true;
    }
    if (blocked) {
      gameBlocked.add(userId);
    }
  }

  const candidates: AbandonedAccountDumpCandidate[] = [];
  let wouldDeferOpenChallenge = 0;
  for (const userId of inactiveRegistered) {
    if (gameBlocked.has(userId)) {
      continue;
    }
    const lastSeen = state.userById.get(userId)!.lastSeen!;
    const name = (state.usersNameById.get(userId) ?? '').trim();
    const defer = trackDefer
      && (state.openChallengeUserIds.has(userId) || state.realStandingUserIds.has(userId));
    if (defer) {
      wouldDeferOpenChallenge += 1;
    }
    candidates.push({
      userId,
      lastSeen,
      name,
      ...(defer ? { wouldDeferOpenChallenge: true } : {}),
    });
  }

  candidates.sort((a, b) => a.lastSeen - b.lastSeen);

  return {
    summary: {
      inactiveBeforeMs,
      registeredHumans: humans.length,
      inactiveRegistered: inactiveRegistered.length,
      blockedCompleted,
      blockedCurrent,
      blockedGameRow,
      gameBlockedUnique: gameBlocked.size,
      candidates: candidates.length,
      wouldDeferOpenChallenge,
    },
    candidates,
  };
}
