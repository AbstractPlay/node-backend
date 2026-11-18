/**
 * @param {{ gameEndKind?: string; gameEndPlayer?: number; eogReason?: string } | undefined} indexRow
 * @param {{ gameEndKind?: string; gameEndPlayer?: number; eogReason?: string } | undefined} derived
 * @param {boolean} refreshGameEndPlayer
 * @returns {'no_index' | 'has_meta' | 'needs_update'}
 */
export function assessCompletedIndexEndMeta(indexRow, derived, refreshGameEndPlayer) {
  if (!indexRow) {
    return 'no_index';
  }
  if (indexRow.gameEndKind === undefined) {
    return 'needs_update';
  }
  if (
    refreshGameEndPlayer
    && derived?.gameEndPlayer !== undefined
    && indexRow.gameEndPlayer !== derived.gameEndPlayer
  ) {
    return 'needs_update';
  }
  return 'has_meta';
}