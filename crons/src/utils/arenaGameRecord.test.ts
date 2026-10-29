import { describe, expect, it } from "vitest";
import { GameFactory, addResource } from "@abstractplay/gameslib";
import { enApgames, enApresults } from "./gameslibEnLocaleBundles.js";
import { buildGameRecordForDumpRow } from "./archiveGameRecord.js";
import type { GameRec } from "../types/GameRec.js";

const GAME_ID = "b512db1e-4250-4fc6-bce6-f6542e60a0b9";

describe("arena game records", () => {
    it("stamps header.site playMode, arenaTcId, and arenaClock from GAME dump row", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const engine = GameFactory("archimedes", undefined, ["8x10"]);
        expect(engine).toBeDefined();
        engine!.gameover = true;

        const gdata: GameRec = {
            pk: "GAME",
            sk: `archimedes#1#${GAME_ID}`,
            id: GAME_ID,
            metaGame: "archimedes",
            state: engine!.serialize(),
            rated: false,
            playMode: "arena",
            arenaTcId: "blitz_5_3",
            arenaClock: { startSec: 300, incSec: 3, maxSec: 300 },
            players: [
                { id: "p1", name: "Tester 1", time: 0 },
                { id: "p2", name: "Tester 2", time: 300_000 },
            ],
        };

        const rec = buildGameRecordForDumpRow(gdata, {
            registeredBots: new Set(),
            event: null,
            round: null,
        });

        expect(rec).toBeDefined();
        expect(rec!.header.site.playMode).toBe("arena");
        expect(rec!.header.site.arenaTcId).toBe("blitz_5_3");
        expect(rec!.header.site.arenaClock).toEqual({
            startSec: 300,
            incSec: 3,
            maxSec: 300,
        });
        expect(rec!.header.site.gameid).toContain(GAME_ID);
        expect(rec!.header.unrated).toBe(true);
    });

    it("leaves playMode off header.site for correspondence dump rows", () => {
        addResource("en", undefined, {
            bundles: { apgames: enApgames, apresults: enApresults },
        });

        const engine = GameFactory("archimedes", undefined, ["8x10"]);
        expect(engine).toBeDefined();
        engine!.gameover = true;

        const gdata: GameRec = {
            pk: "GAME",
            sk: `archimedes#1#correspondence-${GAME_ID}`,
            id: `correspondence-${GAME_ID}`,
            metaGame: "archimedes",
            state: engine!.serialize(),
            rated: true,
            players: [
                { id: "p1", name: "Alice", time: 1 },
                { id: "p2", name: "Bob", time: 2 },
            ],
        };

        const rec = buildGameRecordForDumpRow(gdata, {
            registeredBots: new Set(),
            event: null,
            round: null,
        });

        expect(rec!.header.site.playMode).toBeUndefined();
        expect(rec!.header.site.arenaTcId).toBeUndefined();
        expect(rec!.header.site.arenaClock).toBeUndefined();
    });
});
