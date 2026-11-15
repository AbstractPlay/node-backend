import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import { repairTumbleweedFogStack } from '../../lib/tumbleweedFogRepair.ts';

const g0 = GameFactory('tumbleweed', undefined, ['fog', 'size-6']);
if (g0 === undefined) {
  throw new Error('GameFactory(tumbleweed) unavailable');
}

const centre = g0.graph?.coords2algebraic(5, 5) ?? 'h1';
const afterOpen = g0.move(`${centre},j2`, { trusted: true });

for (const kind of ['resign', 'timeout']) {
  for (const who of [1, 2]) {
    const ended = kind === 'resign' ? afterOpen.resign(who) : afterOpen.timeout(who);
    const state = ended.state();
    const result = repairTumbleweedFogStack(state);
    assert.notEqual(
      result.reason,
      `The algebraic notation is invalid: ${kind}`,
      `EOG replay should handle ${kind}`,
    );
  }
}