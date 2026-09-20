import { describe, expect, it } from "vitest";
import { GameFactory, addResource } from "@abstractplay/gameslib";
import { enApgames, enApresults } from "../utils/gameslibEnLocaleBundles.js";
import { encodeRecordGameId } from "../utils/recordGameId.js";
import { gameRecordIsUnrated } from "../utils/recordUnrated.js";
import { resolveGameVariantUids } from "../utils/resolveGameVariants.js";

const INSTANCE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("records variant i18n", () => {
    it("resolves variant labels when generating records (same path as records.ts)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("archimedes", undefined, ["8x10"]);
        expect(g).toBeDefined();
        g!.gameover = true;

        const variants = g!.getVariants();
        for (const label of variants) {
            expect(label).not.toMatch(/^variants\./);
        }
        expect(variants).toContain("8x10 board");
    });

    it("encodes variant UIDs in gameid when generating records (same path as records.ts)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("archimedes", undefined, ["8x10"]);
        expect(g).toBeDefined();
        g!.gameover = true;

        const variantUids = g!.variants ?? [];
        expect(variantUids).toContain("8x10");

        const rec = g!.genRecord({
            uid: encodeRecordGameId(INSTANCE_ID, "archimedes", variantUids),
            players: [
                { uid: "alice", name: "Alice" },
                { uid: "bob", name: "Bob" },
            ],
        });
        expect(rec).toBeDefined();
        expect(rec!.header.site.gameid).toBe(`${INSTANCE_ID}#archimedes:8x10`);
    });

    it("sets header.unrated when game record is unrated (same path as records.ts)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("arimaa", undefined, ["free"]);
        expect(g).toBeDefined();
        g!.gameover = true;

        const variantUids = g!.variants ?? [];
        const unrated = gameRecordIsUnrated("arimaa", variantUids, true);
        expect(unrated).toBe(true);

        const rec = g!.genRecord({
            uid: encodeRecordGameId(INSTANCE_ID, "arimaa", variantUids),
            players: [
                { uid: "alice", name: "Alice" },
                { uid: "bob", name: "Bob" },
            ],
            unrated: unrated ? true : undefined,
        });
        expect(rec!.header.unrated).toBe(true);
    });

    it("reconciles record variants when state variants are empty (amazons retroactive bug)", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const g = GameFactory("amazons", undefined, ["scrambled"]);
        expect(g).toBeDefined();
        g!.gameover = true;
        const stateWithEmptyVariants = JSON.parse(g!.serialize()) as { variants: string[] };
        stateWithEmptyVariants.variants = [];
        const reloaded = GameFactory("amazons", JSON.stringify(stateWithEmptyVariants));
        expect(reloaded).toBeDefined();
        expect(reloaded!.variants).toEqual([]);

        const recordVariants = ["scrambled"];
        const variantUids = resolveGameVariantUids(reloaded!.variants, recordVariants, {
            metaGame: "amazons",
            gameId: INSTANCE_ID,
        });
        expect(variantUids).toEqual(["scrambled"]);
        if (variantUids.length > 0 && (reloaded!.variants?.length ?? 0) === 0) {
            reloaded!.variants = variantUids;
        }

        const rec = reloaded!.genRecord({
            uid: encodeRecordGameId(INSTANCE_ID, "amazons", variantUids),
            players: [
                { uid: "alice", name: "Alice" },
                { uid: "bob", name: "Bob" },
            ],
        });
        expect(rec).toBeDefined();
        expect(rec!.header.site.gameid).toBe(`${INSTANCE_ID}#amazons:scrambled`);
        expect(rec!.header.game.variants).toContain("Scrambled");
    });
});
