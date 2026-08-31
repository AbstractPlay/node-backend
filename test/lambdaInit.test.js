"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

test("gameslib loads via ESM import", async () => {
  const gl = await import("@abstractplay/gameslib");
  assert.ok(gl.gameinfo);
  assert.equal(typeof gl.GameFactory, "function");
});

test("abstractplay handler module loads", async () => {
  const ap = await import("../api/abstractplay.js");
  const handlers = ap.default ?? ap;
  assert.equal(typeof handlers.query, "function");
  assert.equal(typeof handlers.authQuery, "function");
  assert.equal(typeof handlers.botQuery, "function");
});
