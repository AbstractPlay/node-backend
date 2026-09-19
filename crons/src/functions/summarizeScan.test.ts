import { describe, expect, it } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import {
    accumulateRivalryPair,
    finalizeRivalryPairs,
} from "./summarizeHelpers.js";
import {
    buildPastDisplayNamesList,
    buildPlayerStats,
    createSummarizeScanState,
    scanRecord,
} from "./summarizeScan.js";

const CHESS_GAMEID = "f47ac10b-58cc-4372-a567-0e02b2c3d479#chess:";
const CHESS_GAMEID_2 = "b47ac10b-58cc-4372-a567-0e02b2c3d481#chess:";
const GO_GAMEID = "a47ac10b-58cc-4372-a567-0e02b2c3d480#go:";

function minimalRec(opts: {
    gameid: string;
    gameName: string;
    dateEnd: string;
    p1: string;
    p2: string;
    p1Name?: string;
    p2Name?: string;
}): APGameRecord {
    return {
        header: {
            game: { name: opts.gameName },
            site: { name: "Abstract Play", gameid: opts.gameid },
            "date-start": opts.dateEnd,
            "date-end": opts.dateEnd,
            "date-generated": opts.dateEnd,
            players: [
                { name: opts.p1Name ?? "A", userid: opts.p1, result: 1 },
                { name: opts.p2Name ?? "B", userid: opts.p2, result: 0 },
            ],
        },
        moves: [["e4", "e5"], ["d4", "d5"]],
    } as APGameRecord;
}

describe("summarizeScan", () => {
    it("accumulates player stats in one pass without storing full record lists", () => {
        const state = createSummarizeScanState();
        const gameInfo = new Map();
        scanRecord(state, minimalRec({ gameid: CHESS_GAMEID, gameName: "Chess", dateEnd: "2024-01-01T00:00:00Z", p1: "alice", p2: "bob" }), gameInfo);
        scanRecord(state, minimalRec({ gameid: GO_GAMEID, gameName: "Go", dateEnd: "2024-01-02T00:00:00Z", p1: "alice", p2: "carol" }), gameInfo);

        expect(state.numGames).toBe(2);
        expect(state.playerIDs).toEqual(new Set(["alice", "bob", "carol"]));

        const stats = buildPlayerStats(state);
        const alice = stats.allPlays.find((r) => r.user === "alice");
        expect(alice?.value).toBe(2);
        expect(stats.eclectic.find((r) => r.user === "alice")?.value).toBe(2);
        expect(stats.social.find((r) => r.user === "alice")?.value).toBe(2);
    });

    it("matches batch rivalry counting via incremental accumulator", () => {
        const counts = new Map();
        const recs = [
            minimalRec({ gameid: CHESS_GAMEID, gameName: "Chess", dateEnd: "2024-01-01T00:00:00Z", p1: "alice", p2: "bob" }),
            minimalRec({ gameid: CHESS_GAMEID_2, gameName: "Chess", dateEnd: "2024-01-02T00:00:00Z", p1: "alice", p2: "bob" }),
        ];
        for (const rec of recs) {
            accumulateRivalryPair(counts, rec);
        }
        const pairs = finalizeRivalryPairs(counts, 2);
        expect(pairs).toEqual([{ userA: "alice", userB: "bob", n: 2 }]);
    });

    it("buildPastDisplayNamesList excludes current USERS name", () => {
        const state = createSummarizeScanState();
        const gameInfo = new Map();
        scanRecord(
            state,
            minimalRec({
                gameid: CHESS_GAMEID,
                gameName: "Chess",
                dateEnd: "2024-01-01T00:00:00Z",
                p1: "alice",
                p2: "bob",
                p1Name: "Alice Old",
            }),
            gameInfo,
        );
        scanRecord(
            state,
            minimalRec({
                gameid: CHESS_GAMEID_2,
                gameName: "Chess",
                dateEnd: "2024-01-02T00:00:00Z",
                p1: "alice",
                p2: "bob",
                p1Name: "Alice Current",
            }),
            gameInfo,
        );
        const current = new Map([
            ["alice", "Alice Current"],
            ["bob", "B"],
        ]);
        const list = buildPastDisplayNamesList(state.pastNamesByUser, current);
        expect(list).toEqual([{ user: "alice", names: ["Alice Old"] }]);
    });
});
