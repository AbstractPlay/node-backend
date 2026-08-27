"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

test("gameslib loads via CommonJS require", () => {
  const gl = require("@abstractplay/gameslib");
  assert.ok(gl.gameinfo);
  assert.ok(typeof gl.GameFactory === "function");
});

test("abstractplay handler module loads", () => {
  const ap = require("../api/abstractplay");
  assert.equal(typeof ap.query, "function");
  assert.equal(typeof ap.authQuery, "function");
  assert.equal(typeof ap.botQuery, "function");
});
