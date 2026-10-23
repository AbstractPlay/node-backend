import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { completedTournamentsPendingArchive } from '../lib/public/tournaments.js';

describe('completedTournamentsPendingArchive', () => {
  it('includes ended tournaments for the meta game that are not yet archived', () => {
    const archivedIds = new Set(['old-1']);
    const active = [
      { id: 'old-1', metaGame: 'jacynth', variants: [], dateEnded: 1 },
      { id: 'new-11', metaGame: 'jacynth', variants: [], dateEnded: 2 },
      { id: 'running', metaGame: 'jacynth', variants: [] },
      { id: 'other', metaGame: 'volo', variants: [], dateEnded: 3 },
    ];
    const pending = completedTournamentsPendingArchive(active, 'jacynth', archivedIds);
    assert.deepEqual(pending.map((t) => t.id), ['new-11']);
  });
});
