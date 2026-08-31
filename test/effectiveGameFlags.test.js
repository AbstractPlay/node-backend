const { test } = require("node:test");
const assert = require("node:assert/strict");
const { flagSetIncludes } = require("../lib/effectiveGameFlags");

test("flagSetIncludes checks membership", () => {
  assert.equal(flagSetIncludes(["pie-even", "check"], "pie-even"), true);
  assert.equal(flagSetIncludes(["check"], "pie-even"), false);
  assert.equal(flagSetIncludes(undefined, "pie"), false);
});
