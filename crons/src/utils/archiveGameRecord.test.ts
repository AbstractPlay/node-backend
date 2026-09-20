import { describe, expect, it } from "vitest";
import { shouldOmitFromRecords } from "@abstractplay/gameslib";
import { genRecordFromArchiveStub } from "./archiveGameRecord.js";
import type { GameRec } from "../types/GameRec.js";

describe("archiveGameRecord", () => {
    it("omits binar via registry policy", () => {
        expect(shouldOmitFromRecords("binar")).toBe(true);
    });

    it("builds a stub gamerecord from archived Dynamo state using registry metadata", () => {
        const gdata: GameRec = {
            pk: "GAME",
            sk: "GAME#binar#1#abc",
            id: "abc",
            metaGame: "binar",
            state: JSON.stringify({
                game: "binar",
                gameover: true,
                winner: [1],
                numplayers: 2,
                variants: ["partisan"],
                stack: [
                    { _timestamp: "2024-01-01T00:00:00.000Z", currplayer: 1 },
                    { _timestamp: "2024-01-02T00:00:00.000Z", currplayer: 2 },
                    { _timestamp: "2024-01-03T00:00:00.000Z", currplayer: 1 },
                    { _timestamp: "2024-01-04T00:00:00.000Z", currplayer: 2 },
                ],
            }),
            players: [
                { id: "p1", name: "Alice", time: 1 },
                { id: "p2", name: "Bob", time: 2 },
            ],
        };

        const rec = genRecordFromArchiveStub(gdata, ["partisan"], {
            uid: "abc|binar|partisan",
            players: [
                { uid: "p1", name: "Alice" },
                { uid: "p2", name: "Bob" },
            ],
        });

        expect(rec).toBeDefined();
        expect(rec!.header.game.name).toBe("Binar");
        expect(rec!.header.players).toHaveLength(2);
        expect(rec!.header.players[0]!.result).toBe(Number.POSITIVE_INFINITY);
        expect(rec!.moves.length).toBeGreaterThanOrEqual(3);
    });
});
