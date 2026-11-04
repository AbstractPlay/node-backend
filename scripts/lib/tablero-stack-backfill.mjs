/** @typedef {'all' | 'in-flight' | 'completed'} TableroBackfillScope */

export const TABLERO_BACKFILL_SCOPES = ['all', 'in-flight', 'completed'];

const AUDIT_CSV_HEADER = [
  'sk',
  'in_flight',
  'verify_ok',
  'repair_changed',
  'needs_update',
  'failure_class',
  'reason',
  'option4_attempted',
  'unreplayable',
].join(',');

/** @param {string | undefined} reason */
export function classifyVerifyFailureReason(reason) {
  if (reason === undefined || reason === '') {
    return 'unknown';
  }
  if (reason === 'stack frame mismatch vs replay') {
    return 'history_divergence';
  }
  if (reason.startsWith('tip playfields mismatch')) {
    return 'tip_mismatch';
  }
  if (reason === 'corrected playable tip from replay' || reason === 'stack repaired') {
    return 'repaired';
  }
  if (reason === 'MOVES_GAMEOVER') {
    return 'withdrawal_replay';
  }
  if (reason.includes('Unable to process the various parts of the following move: resign')
    || reason.includes('Unable to process the various parts of the following move: timeout')
    || reason.includes('Unable to process the various parts of the following move: abandoned')) {
    return 'withdrawal_replay';
  }
  if (reason.includes('board.get is not a function')) {
    return 'deserialize';
  }
  return 'other';
}

const TIP_MISMATCH_PREFIX = 'tip playfields mismatch after replay';

/** @param {string | undefined} reason */
export function parseTipMismatchPlayableFields(reason) {
  if (reason === undefined || !reason.startsWith(TIP_MISMATCH_PREFIX)) {
    return null;
  }
  const open = reason.indexOf('(');
  if (open === -1) {
    return [];
  }
  const close = reason.indexOf(')', open);
  if (close === -1) {
    return [];
  }
  return reason
    .slice(open + 1, close)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True only when the row looks like genuine data loss, not a replay tooling gap. */
export function isGenuineUnreplayable(reason, repaired, verifyOk) {
  if (verifyOk || repaired) {
    return false;
  }
  const kind = classifyVerifyFailureReason(reason);
  if (kind === 'deserialize') {
    return true;
  }
  if (kind === 'tip_mismatch') {
    const fields = parseTipMismatchPlayableFields(reason);
    if (fields === null) {
      return false;
    }
    if (fields.length === 0) {
      return false;
    }
    return fields.includes('board') || fields.includes('pieces');
  }
  return false;
}

/**
 * @param {TableroBackfillScope} scope
 * @param {{ gameEnded?: unknown }} item
 */
export function matchesScope(item, scope) {
  if (scope === 'all') {
    return true;
  }
  const inFlight = isInFlight(item);
  if (scope === 'in-flight') {
    return inFlight;
  }
  if (scope === 'completed') {
    return !inFlight;
  }
  throw new Error(`Unknown scope: ${scope}`);
}

/** @param {{ gameEnded?: unknown; sk?: string }} item */
export function isInFlight(item) {
  const sk = String(item.sk ?? '');
  if (sk.includes('#0#')) {
    return true;
  }
  if (sk.includes('#1#')) {
    return false;
  }
  return item.gameEnded === undefined || item.gameEnded === null || item.gameEnded === '';
}

/** @param {unknown} value */
export function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function auditCsvHeader() {
  return AUDIT_CSV_HEADER;
}

/**
 * Option 4 edge fallback — GAME rows do not store an external move list today.
 * @param {Record<string, unknown>} item
 */
export function tryAlternateMoveSource(item) {
  if (item.recordsMoves !== undefined || item.moveList !== undefined) {
    return {
      attempted: true,
      recovered: false,
      reason: 'alternate move field present but stack rebuild from it is not implemented',
    };
  }
  return { attempted: false, recovered: false, reason: undefined };
}

/**
 * @param {Record<string, unknown>} item
 * @param {object} deps
 */
export function assessTableroRow(item, deps) {
  const {
    metaGame,
    decompressGameState,
    resolveVariantFieldsForGameRecord,
    verifyTableroStackIntegrity,
    repairTableroStackJson,
    prepareGameStateForStorage,
  } = deps;

  const beforeJson = decompressGameState(String(item.state ?? ''));
  const { variants, stateJson: variantJson } = resolveVariantFieldsForGameRecord(
    metaGame,
    String(item.state ?? ''),
    /** @type {string[] | undefined} */ (item.variants),
  );

  const verifyBefore = verifyTableroStackIntegrity(variantJson);
  const { stateJson: repairedJson, repaired, reason: repairReason } = repairTableroStackJson(variantJson);

  const option4 = !verifyBefore.ok && !repaired
    ? tryAlternateMoveSource(item)
    : { attempted: false, recovered: false, reason: undefined };

  const verify = repaired ? verifyTableroStackIntegrity(repairedJson) : verifyBefore;

  const stateForStorage = repaired ? repairedJson : variantJson;
  const stored = prepareGameStateForStorage({
    ...item,
    metaGame,
    variants,
    state: stateForStorage,
  });

  const afterJson = decompressGameState(stored.state);
  const needsUpdate = afterJson !== beforeJson
    || JSON.stringify(variants ?? []) !== JSON.stringify(item.variants ?? [])
    || stored.numMoves !== item.numMoves;

  const reason = repaired && verify.ok
    ? (repairReason ?? 'stack repaired')
    : (repairReason ?? verifyBefore.reason ?? option4.reason ?? '');
  const failureClass = classifyVerifyFailureReason(reason);
  const unreplayable = isGenuineUnreplayable(reason, repaired, verify.ok);

  return {
    sk: String(item.sk ?? ''),
    inFlight: isInFlight(item),
    verifyOk: verify.ok,
    repairChanged: repaired,
    needsUpdate,
    failureClass,
    reason,
    option4Attempted: option4.attempted,
    unreplayable,
    variants,
    stored,
  };
}

/**
 * @param {ReturnType<typeof assessTableroRow>} row
 */
export function formatAuditCsvLine(row) {
  return [
    csvEscape(row.sk),
    row.inFlight ? 'yes' : 'no',
    row.verifyOk ? 'yes' : 'no',
    row.repairChanged ? 'yes' : 'no',
    row.needsUpdate ? 'yes' : 'no',
    csvEscape(row.failureClass),
    csvEscape(row.reason),
    row.option4Attempted ? 'yes' : 'no',
    row.unreplayable ? 'yes' : 'no',
  ].join(',');
}
