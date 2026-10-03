import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  expectedApVersions,
  findCronsApPinMismatches,
  syncCronsApPins,
} from "../../scripts/lib/crons-ap-pins.mjs";

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

test("syncCronsApPins copies root @abstractplay versions into crons workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crons-ap-pins-"));
  writeJson(path.join(root, "ci-deps.dev.json"), {
    gameslib: "1.0.0-ci-1.0",
    renderer: "1.0.0-ci-2.0",
    recranks: "1.0.0-ci-3.0",
  });
  writeJson(path.join(root, "package.json"), {
    dependencies: {
      "@abstractplay/gameslib": "1.0.0-ci-9.0",
      "@abstractplay/renderer": "1.0.0-ci-8.0",
      "@abstractplay/recranks": "1.0.0-ci-7.0",
    },
  });
  writeJson(path.join(root, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": {
        dependencies: {
          "@abstractplay/gameslib": "1.0.0-ci-9.0",
          "@abstractplay/renderer": "1.0.0-ci-8.0",
          "@abstractplay/recranks": "1.0.0-ci-7.0",
        },
      },
    },
  });
  writeJson(path.join(root, "crons", "package.json"), {
    dependencies: {
      "@abstractplay/gameslib": "1.0.0-ci-stale.0",
      "@abstractplay/renderer": "1.0.0-ci-stale.0",
      "@abstractplay/recranks": "1.0.0-ci-stale.0",
    },
  });

  const result = syncCronsApPins(root, "dev");
  assert.equal(result.changed, true);
  assert.deepEqual(expectedApVersions(root, "dev"), {
    "@abstractplay/gameslib": "1.0.0-ci-9.0",
    "@abstractplay/renderer": "1.0.0-ci-8.0",
    "@abstractplay/recranks": "1.0.0-ci-7.0",
  });
  assert.equal(findCronsApPinMismatches(root).length, 0);
});
