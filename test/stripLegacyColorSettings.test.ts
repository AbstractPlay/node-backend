import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { stripColorFromSettings } from '../lib/stripLegacyColorSettings.js';

describe('stripColorFromSettings', () => {
  it('returns empty object for null/undefined', () => {
    assert.deepEqual(stripColorFromSettings(null), {});
    assert.deepEqual(stripColorFromSettings(undefined), {});
  });

  it('removes color from settings.all and per-meta-game objects', () => {
    const input = {
      all: { annotate: true, color: 'blind', notifications: { yourturn: true } },
      chess: { color: 'My Red', display: 'default' },
      bide: { annotate: false },
    };
    assert.deepEqual(stripColorFromSettings(input), {
      all: { annotate: true, notifications: { yourturn: true } },
      chess: { display: 'default' },
      bide: { annotate: false },
    });
    assert.equal((input.all as { color?: string }).color, 'blind');
  });

  it('leaves settings without color unchanged', () => {
    const input = { all: { annotate: true } };
    assert.deepEqual(stripColorFromSettings(input), { all: { annotate: true } });
  });
});
