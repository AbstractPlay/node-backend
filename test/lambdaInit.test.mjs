import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAMBDA_HANDLER_ENTRIES } from "../scripts/lambda-esbuild-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_ROOT = path.join(ROOT, ".test-artifacts", "lambda-bundles");

// Handlers that read process.env during module init (e.g. CognitoJwtVerifier.create).
process.env.userpoolId ??= "us-east-1_TESTPOOL";
process.env.userpoolClient ??= "test-client-id";
process.env.ABSTRACT_PLAY_TABLE ??= "abstract-play-test";

function bundlePath(handlerEntry) {
  const rel = handlerEntry.replace(/\.ts$/, ".mjs");
  return path.join(BUNDLE_ROOT, rel);
}

async function importBundle(handlerEntry) {
  const filePath = bundlePath(handlerEntry);
  assert.ok(
    fs.existsSync(filePath),
    `missing ${path.relative(ROOT, filePath)} — run npm run build:lambda-bundles`,
  );
  return import(pathToFileURL(filePath).href);
}

test("gameslib loads via ESM import", async () => {
  const gl = await import("@abstractplay/gameslib");
  assert.ok(gl.gameinfo);
  assert.equal(typeof gl.GameFactory, "function");
});

const API_HTTP_HANDLER_EXPORTS = {
  "api/query.ts": "query",
  "api/authQuery.ts": "authQuery",
  "api/botQuery.ts": "botQuery",
};

for (const handlerEntry of LAMBDA_HANDLER_ENTRIES) {
  const label = handlerEntry.replace(/\.ts$/, "");
  const apiExport = API_HTTP_HANDLER_EXPORTS[handlerEntry];

  test(`Lambda ESM bundle loads: ${label}`, async () => {
    const mod = await importBundle(handlerEntry);
    const handlers = mod.default ?? mod;
    const fn = apiExport
      ? handlers[apiExport]
      : handlers.handler ?? handlers;
    assert.equal(typeof fn, "function", `${label} must export a handler function`);
  });
}
