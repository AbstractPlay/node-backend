import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  normalizeAvatarInSettings,
  validateAvatar,
  validateAvatarSeed,
} from '../lib/dicebearAvatar.js';

describe('dicebearAvatar', () => {
  it('accepts allowed styles and normalized seeds', () => {
    const result = validateAvatar({ style: 'blobs', seed: '  user_1  ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.avatar, { style: 'blobs', seed: 'user_1' });
    }
  });

  it('rejects unknown styles', () => {
    const result = validateAvatar({ style: 'voxel-art', seed: 'user_1' });
    assert.equal(result.ok, false);
  });

  it('rejects invalid seeds', () => {
    assert.equal(validateAvatarSeed('bad seed').ok, false);
    assert.equal(validateAvatarSeed('').ok, false);
    assert.equal(validateAvatarSeed('a'.repeat(65)).ok, false);
  });

  it('normalizes avatar in settings and reports presence', () => {
    const settings = {
      all: {
        profile: {
          avatar: { style: 'glass', seed: 'seed-1' },
        },
      },
    };
    const result = normalizeAvatarInSettings(settings);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.hasAvatar, true);
      assert.deepEqual(settings.all.profile.avatar, {
        style: 'glass',
        seed: 'seed-1',
      });
    }
  });

  it('clears null avatar and reports absence', () => {
    const settings = {
      all: {
        profile: {
          avatar: null,
        },
      },
    };
    const result = normalizeAvatarInSettings(settings);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.hasAvatar, false);
      assert.equal('profile' in settings.all, false);
    }
  });

  it('returns hasAvatar false when profile avatar is absent', () => {
    const settings = { all: { notifications: { yourturn: true } } };
    const result = normalizeAvatarInSettings(settings);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.hasAvatar, false);
    }
  });
});
