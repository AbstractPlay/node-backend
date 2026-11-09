import { describe, expect, it } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import { shouldOmitFromRecords } from "@abstractplay/gameslib";
import {
    applyDynamoTimestampsToArchivedRecord,
    genRecordFromArchiveStub,
    stampSkipRatingFromGameRec,
} from "./archiveGameRecord.js";
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

    it("applyDynamoTimestampsToArchivedRecord overwrites date-end from gameEnded", () => {
        const ended = Date.UTC(2024, 11, 20, 2, 34, 16, 680);
        const started = Date.UTC(2024, 11, 1, 12, 0, 0, 0);
        const rec: APGameRecord = {
            header: {
                game: { name: "Test", variants: [] },
                site: { name: "Abstract Play", gameid: "x#tablero:" },
                "date-start": "2026-01-01T00:00:00.000Z",
                "date-end": "2026-11-04T22:37:04.181Z",
                "date-generated": "2026-11-04T22:37:04.181Z",
                players: [],
            },
            moves: [],
        };
        const gdata = {
            gameEnded: ended,
            gameStarted: started,
        } as GameRec;
        applyDynamoTimestampsToArchivedRecord(rec, gdata);
        expect(rec.header["date-end"]).toBe(new Date(ended).toISOString());
        expect(rec.header["date-start"]).toBe(new Date(started).toISOString());
    });

    it("stampSkipRatingFromGameRec copies per-seat flags", () => {
        const gdata: GameRec = {
            pk: "GAME",
            sk: "GAME#binar#1#abc",
            id: "abc",
            metaGame: "binar",
            state: JSON.stringify({
                game: "binar",
                gameover: true,
                winner: [2],
                numplayers: 2,
                variants: ["partisan"],
                stack: [
                    { _timestamp: "2024-01-01T00:00:00.000Z" },
                    { _timestamp: "2024-01-02T00:00:00.000Z" },
                    { _timestamp: "2024-01-03T00:00:00.000Z" },
                    { _timestamp: "2024-01-04T00:00:00.000Z" },
                ],
            }),
            players: [
                { id: "p1", name: "Alice", time: 1, skipRating: true },
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
        stampSkipRatingFromGameRec(rec!, gdata);
        expect(rec!.header.players[0]!.skipRating).toBe(true);
        expect(rec!.header.players[1]!.skipRating).toBeUndefined();
    });

    it("applyDynamoTimestampsToArchivedRecord falls back to lastMoveTime when gameEnded absent", () => {
        const t = Date.UTC(2024, 5, 1, 10, 0, 0, 0);
        const rec: APGameRecord = {
            header: {
                game: { name: "Test", variants: [] },
                site: { name: "Abstract Play", gameid: "x#chess:" },
                "date-start": "2020-01-01T00:00:00.000Z",
                "date-end": "2030-01-01T00:00:00.000Z",
                "date-generated": "2030-01-01T00:00:00.000Z",
                players: [],
            },
            moves: [],
        };
        applyDynamoTimestampsToArchivedRecord(rec, { lastMoveTime: t } as GameRec);
        expect(rec.header["date-end"]).toBe(new Date(t).toISOString());
    });
});
