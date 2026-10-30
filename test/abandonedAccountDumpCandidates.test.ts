import { describe, expect, it } from 'vitest';
import {
  createAbandonedAccountDumpCollector,
  finalizeAbandonedAccountDumpCandidates,
  processAbandonedAccountDumpItem,
} from '../lib/abandonedAccountDumpCandidates.js';

const INACTIVE_BEFORE = 1_000_000;
const OLD = 500_000;
const RECENT = 2_000_000;

describe('abandonedAccountDumpCandidates', () => {
  it('includes inactive registered human with no game rows', () => {
    const state = createAbandonedAccountDumpCollector();
    processAbandonedAccountDumpItem(state, {
      pk: 'USER',
      sk: 'u1',
      lastSeen: OLD,
    });
    processAbandonedAccountDumpItem(state, {
      pk: 'USERS',
      sk: 'u1',
      name: 'Alice',
    });

    const result = finalizeAbandonedAccountDumpCandidates(state, INACTIVE_BEFORE);
    expect(result.summary.candidates).toBe(1);
    expect(result.candidates[0]?.userId).toBe('u1');
  });

  it('excludes user with COMPLETEDGAMES# partition', () => {
    const state = createAbandonedAccountDumpCollector();
    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u1', lastSeen: OLD });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'u1', name: 'Alice' });
    processAbandonedAccountDumpItem(state, { pk: 'COMPLETEDGAMES#u1', sk: '100#g1' });

    const result = finalizeAbandonedAccountDumpCandidates(state, INACTIVE_BEFORE);
    expect(result.summary.candidates).toBe(0);
    expect(result.summary.gameBlockedUnique).toBe(1);
  });

  it('excludes bots and admins and unregistered', () => {
    const state = createAbandonedAccountDumpCollector();
    processAbandonedAccountDumpItem(state, { pk: 'BOT', sk: 'bot1' });
    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'bot1', lastSeen: OLD });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'bot1', name: 'Botty' });

    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u2', lastSeen: OLD, admin: true });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'u2', name: 'Admin' });

    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u3', lastSeen: OLD });

    const result = finalizeAbandonedAccountDumpCandidates(state, INACTIVE_BEFORE);
    expect(result.summary.candidates).toBe(0);
  });

  it('excludes recent lastSeen and missing lastSeen', () => {
    const state = createAbandonedAccountDumpCollector();
    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u1', lastSeen: RECENT });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'u1', name: 'Recent' });
    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u2' });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'u2', name: 'NoSeen' });

    const result = finalizeAbandonedAccountDumpCandidates(state, INACTIVE_BEFORE);
    expect(result.summary.inactiveRegistered).toBe(0);
  });

  it('tags open challenge defer when requested', () => {
    const state = createAbandonedAccountDumpCollector();
    processAbandonedAccountDumpItem(state, { pk: 'USER', sk: 'u1', lastSeen: OLD });
    processAbandonedAccountDumpItem(state, { pk: 'USERS', sk: 'u1', name: 'Alice' });
    processAbandonedAccountDumpItem(state, {
      pk: 'CHALLENGE',
      sk: 'c1',
      challenger: { id: 'u1', name: 'Alice' },
    });

    const result = finalizeAbandonedAccountDumpCandidates(state, INACTIVE_BEFORE, {
      trackOpenChallengeDefer: true,
    });
    expect(result.summary.candidates).toBe(1);
    expect(result.summary.wouldDeferOpenChallenge).toBe(1);
    expect(result.candidates[0]?.wouldDeferOpenChallenge).toBe(true);
  });
});
