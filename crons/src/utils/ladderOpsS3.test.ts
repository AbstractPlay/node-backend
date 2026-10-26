import { describe, expect, it } from 'vitest';
import type { LadderReconcileReport } from '@backend/lib/ladders/reconcileActiveCounts.js';

describe('ladderOpsS3 report shape', () => {
  it('daily key date comes from generatedAt ISO prefix', () => {
    const report: LadderReconcileReport = {
      generatedAt: '2026-10-26T00:01:12.345Z',
      playersScanned: 10,
      openLadderGamesScanned: 2,
      driftCorrections: 0,
      overCapIncidents: 0,
      zeroDrift: true,
      corrections: [],
    };
    expect(report.generatedAt.slice(0, 10)).toBe('2026-10-26');
  });
});
