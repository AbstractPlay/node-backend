import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("git merge=ours setup", () => {
  it("ships merge driver fragment and lists all pin manifests in .gitattributes", () => {
    const fragment = path.join(ROOT, "config", "git-merge-ours.gitconfig");
    const attrs = fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8");
    const fragmentText = fs.readFileSync(fragment, "utf8");

    assert.match(fragmentText, /\[merge "ours"\]/);
    assert.match(fragmentText, /driver = true/);

    for (const file of [
      "ci-deps.prod.json",
      "ci-deps.dev.json",
      "package-lock.json",
      "crons/package.json",
    ]) {
      assert.match(attrs, new RegExp(`^${file.replace(".", "\\.")} merge=ours`, "m"));
    }
    assert.doesNotMatch(attrs, /^package\.json merge=ours/m);
  });
});
