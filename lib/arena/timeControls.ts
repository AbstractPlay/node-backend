export type ArenaTimeControlTier = 'bullet' | 'blitz' | 'rapid' | 'live';

export type ArenaTimeControl = {
  id: string;
  label: string;
  tier: ArenaTimeControlTier;
  startSec: number;
  incSec: number;
  maxSec: number;
  ratedEligible: boolean;
  enabled: boolean;
};

/** v1 ship set — see arena plan preset catalog. */
export const ARENA_TIME_CONTROLS: ArenaTimeControl[] = [
  {
    id: 'bullet_2_1',
    label: '2+1',
    tier: 'bullet',
    startSec: 120,
    incSec: 1,
    maxSec: 120,
    ratedEligible: true,
    enabled: true,
  },
  {
    id: 'blitz_5_3',
    label: '5+3',
    tier: 'blitz',
    startSec: 300,
    incSec: 3,
    maxSec: 300,
    ratedEligible: true,
    enabled: true,
  },
  {
    id: 'rapid_15_10',
    label: '15+10',
    tier: 'rapid',
    startSec: 900,
    incSec: 10,
    maxSec: 900,
    ratedEligible: true,
    enabled: true,
  },
  {
    id: 'live_45_15',
    label: '45+15',
    tier: 'live',
    startSec: 2700,
    incSec: 15,
    maxSec: 2700,
    ratedEligible: true,
    enabled: true,
  },
];

const byId = new Map(ARENA_TIME_CONTROLS.map((tc) => [tc.id, tc]));

export function getArenaTimeControl(id: string): ArenaTimeControl | undefined {
  return byId.get(id);
}

export function listEnabledArenaTimeControls(): ArenaTimeControl[] {
  return ARENA_TIME_CONTROLS.filter((tc) => tc.enabled);
}
