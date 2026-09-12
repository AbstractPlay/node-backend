import {
  BUG_STATUSES,
  FEATURE_STATUSES,
  TERMINAL_STATUSES,
  WISHLIST_STATUSES,
} from './constants.js';
import type { FeedbackKind } from './types.js';

export function statusesForKind(kind: FeedbackKind): readonly string[] {
  if (kind === 'bug') {
    return BUG_STATUSES;
  }
  if (kind === 'feature') {
    return FEATURE_STATUSES;
  }
  return WISHLIST_STATUSES;
}

export function isTerminalStatus(kind: FeedbackKind, status: string): boolean {
  return (TERMINAL_STATUSES[kind] as readonly string[]).includes(status);
}

export function isValidStatusForKind(kind: FeedbackKind, status: string): boolean {
  return statusesForKind(kind).includes(status);
}

/** Map a non-terminal bug status to the equivalent feature status, or null if not reclassifiable. */
export function mapBugStatusToFeatureStatus(bugStatus: string): string | null {
  if (bugStatus === 'open') {
    return 'open';
  }
  if (bugStatus === 'triaged') {
    return 'under_review';
  }
  return null;
}
