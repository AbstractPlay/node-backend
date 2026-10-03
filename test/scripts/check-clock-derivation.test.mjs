import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLOCK_DERIVATION_ALLOWLIST,
  runClockDerivationCheck,
} from "../../bin/check-clock-derivation.mjs";

describe("check-clock-derivation", () => {
  it("has empty allowlist after Phase 2 wiring", () => {
    assert.deepEqual([...CLOCK_DERIVATION_ALLOWLIST], []);
  });

  it("finds no raw clock derivation in lib/utils", () => {
    const { allowlisted, violations } = runClockDerivationCheck({ strict: false });
    assert.equal(allowlisted.length, 0);
    assert.equal(violations.length, 0);
  });

  it("strict mode passes", () => {
    const { violations, ok } = runClockDerivationCheck({ strict: true });
    assert.equal(violations.length, 0);
    assert.equal(ok, true);
  });
});
