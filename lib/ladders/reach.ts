export function challengeReachBounds(
  callerPoints: number,
  reachPercent: number,
): { low: number; high: number } {
  const factor = reachPercent / 100;
  const low = Math.floor(callerPoints * (1 - factor));
  const high = Math.ceil(callerPoints * (1 + factor));
  return { low, high };
}

export function isPointsWithinReach(
  callerPoints: number,
  opponentPoints: number,
  reachPercent: number,
): boolean {
  const { low, high } = challengeReachBounds(callerPoints, reachPercent);
  return opponentPoints >= low && opponentPoints <= high;
}
