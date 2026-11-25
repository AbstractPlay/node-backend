export function snapshotToMove(toMove: string | boolean[] | null | undefined): string | boolean[] {
  if (Array.isArray(toMove)) {
    return [...toMove];
  }
  if (toMove === undefined || toMove === null) {
    return '';
  }
  return String(toMove);
}

function serializeToMove(toMove: string | boolean[] | null | undefined): string {
  if (toMove === undefined || toMove === null || toMove === '') {
    return '';
  }
  if (Array.isArray(toMove)) {
    return JSON.stringify(toMove);
  }
  return String(toMove);
}

/** True when play continues and the on-move seat assignment changed. */
export function toMoveSeatChanged(
  prev: string | boolean[] | null | undefined,
  next: string | boolean[] | null | undefined,
): boolean {
  if (next === '' || next === null || next === undefined) {
    return false;
  }
  return serializeToMove(prev) !== serializeToMove(next);
}