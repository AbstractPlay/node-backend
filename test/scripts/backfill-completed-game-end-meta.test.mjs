import assert from 'node:assert/strict';
import { assessCompletedIndexEndMeta } from '../../scripts/lib/completed-game-end-meta-backfill.mjs';

assert.equal(
  assessCompletedIndexEndMeta(undefined, { gameEndKind: 'normal' }, false),
  'no_index',
);

assert.equal(
  assessCompletedIndexEndMeta({ gameEndKind: 'normal' }, { gameEndKind: 'normal' }, false),
  'has_meta',
);

assert.equal(
  assessCompletedIndexEndMeta({}, { gameEndKind: 'normal' }, false),
  'needs_update',
);

assert.equal(
  assessCompletedIndexEndMeta(
    { gameEndKind: 'normal', eogReason: 'crosscut' },
    { gameEndKind: 'normal', eogReason: 'crosscut', gameEndPlayer: 1 },
    false,
  ),
  'has_meta',
);

assert.equal(
  assessCompletedIndexEndMeta(
    { gameEndKind: 'normal', eogReason: 'crosscut' },
    { gameEndKind: 'normal', eogReason: 'crosscut', gameEndPlayer: 1 },
    true,
  ),
  'needs_update',
);

assert.equal(
  assessCompletedIndexEndMeta(
    { gameEndKind: 'normal', gameEndPlayer: 1 },
    { gameEndKind: 'normal', gameEndPlayer: 1 },
    true,
  ),
  'has_meta',
);

console.log('backfill-completed-game-end-meta.test.mjs: ok');