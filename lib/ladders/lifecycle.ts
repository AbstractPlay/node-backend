import type { LadderRecord, LadderStatus } from './types.js';

export function computeLadderStatusAfterMemberChange(
  ladder: Pick<LadderRecord, 'status' | 'minActiveMembers' | 'everActivated' | 'activeMemberCount'>,
): LadderStatus {
  const { minActiveMembers, activeMemberCount, everActivated } = ladder;
  if (activeMemberCount >= minActiveMembers) {
    return 'active';
  }
  if (!everActivated) {
    return 'forming';
  }
  return 'suspended';
}

export function shouldSetEverActivated(
  previousStatus: LadderStatus,
  nextStatus: LadderStatus,
  everActivated: boolean,
): boolean {
  if (everActivated) {
    return true;
  }
  return previousStatus === 'forming' && nextStatus === 'active';
}
