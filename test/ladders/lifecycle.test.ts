import { describe, expect, it } from 'vitest';
import {
  computeLadderStatusAfterMemberChange,
  shouldSetEverActivated,
} from '../../lib/ladders/lifecycle.js';

describe('ladder lifecycle (Phase 1 gate: 4 members → active)', () => {
  it('stays forming below minActiveMembers when never activated', () => {
    expect(computeLadderStatusAfterMemberChange({
      status: 'forming',
      minActiveMembers: 4,
      everActivated: false,
      activeMemberCount: 3,
    })).toBe('forming');
  });

  it('becomes active at minActiveMembers', () => {
    expect(computeLadderStatusAfterMemberChange({
      status: 'forming',
      minActiveMembers: 4,
      everActivated: false,
      activeMemberCount: 4,
    })).toBe('active');
  });

  it('sets everActivated on first transition forming → active', () => {
    expect(shouldSetEverActivated('forming', 'active', false)).toBe(true);
    expect(shouldSetEverActivated('active', 'suspended', true)).toBe(true);
  });

  it('drops to suspended after activation when count falls below min', () => {
    expect(computeLadderStatusAfterMemberChange({
      status: 'active',
      minActiveMembers: 4,
      everActivated: true,
      activeMemberCount: 3,
    })).toBe('suspended');
  });
});
