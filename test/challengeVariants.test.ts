import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { gameinfo, validateVariantSelection } from '@abstractplay/gameslib';

describe('challenge variant constraints', () => {
  it('allows valid LOA combinations', () => {
    const info = gameinfo.get('loa');
    assert.ok(info);
    const result = validateVariantSelection(info.variants, ['classic', 'scrambled']);
    assert.equal(result.ok, true);
  });

  it('rejects LOA hex5 with scrambled', () => {
    const info = gameinfo.get('loa');
    assert.ok(info);
    const result = validateVariantSelection(info.variants, ['hex5', 'scrambled']);
    assert.equal(result.ok, false);
  });
});
