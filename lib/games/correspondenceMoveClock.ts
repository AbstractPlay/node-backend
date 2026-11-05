/** Soft correspondence Fischer bank after a completed turn (parity with playHandlers). */
export function applyCorrespondenceMoveBankMs(
  priorBankMs: number,
  thinkTimeChargedMs: number,
  clockIncMs: number,
  clockMaxMs: number,
): number {
  if (priorBankMs - thinkTimeChargedMs < 0) {
    return clockIncMs;
  }
  const next = priorBankMs - thinkTimeChargedMs + clockIncMs;
  return next > clockMaxMs ? clockMaxMs : next;
}

/** pie-even: opponent refund when invoker think time was charged (playHandlers invoke_pie). */
export function pieEvenOpponentRefundMs(thinkTimeChargedMs: number): number {
  return thinkTimeChargedMs;
}
