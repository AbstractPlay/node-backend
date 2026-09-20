import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasInterestingUserGameComments,
  isUserChatComment,
} from '../lib/gameComments.js';

test('isUserChatComment rejects system pie lines', () => {
  assert.equal(isUserChatComment(''), false);
  assert.equal(isUserChatComment('  '), false);
  assert.equal(isUserChatComment('user-1'), true);
});

test('hasInterestingUserGameComments ignores pie-only GAMECOMMENTS', () => {
  const pieOnly = [
    {
      userId: '',
      comment:
        'ganelon elected to switch seats. As a result, the game record for ply 1 has been retroactively changed.',
      timeStamp: 1,
    },
  ];
  assert.equal(hasInterestingUserGameComments(pieOnly), false);

  const withPlayer = [
    ...pieOnly,
    { userId: 'u1', comment: 'Interesting analysis here for sure', timeStamp: 2 },
  ];
  assert.equal(hasInterestingUserGameComments(withPlayer), true);
});
