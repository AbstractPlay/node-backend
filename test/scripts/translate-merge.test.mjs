import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeTranslatedChunkIntoTarget } from "../../bin/translate.mjs";

describe("translate merge", () => {
  it("merges a single nested leaf without clobbering sibling keys", () => {
    const targetData = {
      PUSH: {
        titles: {
          challenged: "Herausgefordert",
          declined: "Abgelehnt",
        },
      },
      Other: "bleibt",
    };
    const diffLeaves = {
      "PUSH.titles.announcement": "Site announcement",
    };
    const translatedChunk = {
      PUSH: {
        titles: {
          announcement: "Website-Ankündigung",
        },
      },
    };

    mergeTranslatedChunkIntoTarget(targetData, diffLeaves, translatedChunk);

    assert.equal(targetData.PUSH.titles.challenged, "Herausgefordert");
    assert.equal(targetData.PUSH.titles.declined, "Abgelehnt");
    assert.equal(targetData.PUSH.titles.announcement, "Website-Ankündigung");
    assert.equal(targetData.Other, "bleibt");
  });

  it("merges flat dotted keys from the model", () => {
    const targetData = { PUSH: { titles: { started: "Gestartet" } } };
    const diffLeaves = { "PUSH.titles.announcement": "Site announcement" };
    const translatedChunk = { "PUSH.titles.announcement": "Ankündigung" };

    mergeTranslatedChunkIntoTarget(targetData, diffLeaves, translatedChunk);

    assert.equal(targetData.PUSH.titles.started, "Gestartet");
    assert.equal(targetData.PUSH.titles.announcement, "Ankündigung");
  });
});
