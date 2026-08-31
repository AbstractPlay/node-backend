const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyPerspectivePlayerRotations,
  flagSetIncludes,
} = require("../lib/effectiveGameFlags");

test("flagSetIncludes checks membership", () => {
  assert.equal(flagSetIncludes(["pie-even", "check"], "pie-even"), true);
  assert.equal(flagSetIncludes(["check"], "pie-even"), false);
  assert.equal(flagSetIncludes(undefined, "pie"), false);
});

test("applyPerspectivePlayerRotations sets 180-degree increments by default", () => {
  const players = [{}, {}, {}];
  applyPerspectivePlayerRotations(players, 3, ["perspective"]);
  assert.deepEqual(players[1].settings, { rotate: 180 });
  assert.deepEqual(players[2].settings, { rotate: 360 });
});

test("applyPerspectivePlayerRotations uses rotate90 for 3+ players", () => {
  const players = [{}, {}, {}, {}];
  applyPerspectivePlayerRotations(players, 4, ["perspective", "rotate90"]);
  assert.deepEqual(players[1].settings, { rotate: -90 });
  assert.deepEqual(players[3].settings, { rotate: -270 });
});

test("applyPerspectivePlayerRotations is a no-op without perspective", () => {
  const players = [{}, {}];
  applyPerspectivePlayerRotations(players, 2, ["rotate90"]);
  assert.equal(players[1].settings, undefined);
});
