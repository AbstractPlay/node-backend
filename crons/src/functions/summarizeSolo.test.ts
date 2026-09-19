import { describe, expect, it } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import {
    accumulateSoloRecord,
    buildSoloMetaStats,
    buildSoloSeedBoards,
    createSoloSummarizeState,
} from "./summarizeSolo.js";

const SEED = "20260819-graded-fixture";
const META_UID = "solo-puzzle";
const VARIANT_KEY = `${META_UID} (standard)`;

function makeGradedSoloRecord(overrides: {
    gameid?: string;
    score?: number;
    grade?: string;
    dateEnd?: string;
} = {}): APGameRecord {
    return {
        header: {
            game: { name: "Solo Puzzle", variants: ["standard"] },
            site: { name: "Abstract Play", gameid: overrides.gameid ?? "solo-graded-1" },
            "date-start": "2026-08-19T14:00:00.000Z",
            "date-end": overrides.dateEnd ?? "2026-08-19T14:30:00.000Z",
            "date-generated": "2026-08-19T14:30:01.000Z",
            "outcome-type": "graded",
            "score-direction": "higher",
            "score-label": "points",
            "challenge-seed": SEED,
            unrated: true,
            players: [{
                name: "alice",
                userid: "user-alice",
                score: overrides.score ?? 73,
                grade: overrides.grade ?? "good",
                result: 1,
            }],
        },
        moves: [
            ["score"],
            ["score"],
            ["finish"],
        ],
    };
}

describe("summarizeSolo", () => {
    it("aggregates three attempts from one user into meta stats and seed board", () => {
        const state = createSoloSummarizeState();
        const attempts = [
            makeGradedSoloRecord({ gameid: "solo-1", score: 60, grade: "ok", dateEnd: "2026-08-19T14:10:00.000Z" }),
            makeGradedSoloRecord({ gameid: "solo-2", score: 73, grade: "good", dateEnd: "2026-08-19T14:20:00.000Z" }),
            makeGradedSoloRecord({ gameid: "solo-3", score: 90, grade: "excellent", dateEnd: "2026-08-19T14:30:00.000Z" }),
        ];
        for (const rec of attempts) {
            accumulateSoloRecord(state, rec, {
                resolveMetaUidFromDisplayName: () => META_UID,
            });
        }

        const metaStats = buildSoloMetaStats(state);
        const variantStats = metaStats[VARIANT_KEY];
        expect(variantStats).toBeDefined();
        expect(variantStats!.attempts).toBe(3);
        expect(variantStats!.uniquePlayers).toBe(1);
        expect(variantStats!.repeatAttemptRate).toBeCloseTo(2 / 3);
        expect(variantStats!.scoreMedianAllAttempts).toBe(73);
        expect(variantStats!.scoreMedianBestPerUser).toBe(90);
        expect(variantStats!.outcomeTypes).toEqual({ graded: 3 });
        expect(variantStats!.gradeHistogramBestPerUser).toEqual({ excellent: 1 });

        const boards = buildSoloSeedBoards(state);
        expect(boards).toHaveLength(1);
        const board = boards[0]!;
        expect(board.challengeSeed).toBe(SEED);
        expect(board.attempts).toBe(3);
        expect(board.uniquePlayers).toBe(1);
        expect(board.rows).toHaveLength(1);
        expect(board.rows[0]).toMatchObject({
            userid: "user-alice",
            score: 90,
            grade: "excellent",
            attempts: 3,
        });
        expect(board.scoreMedianAllAttempts).toBe(73);
        expect(board.scoreMedianBestPerUser).toBe(90);
    });

    it("ignores multiplayer records", () => {
        const state = createSoloSummarizeState();
        const rec: APGameRecord = {
            header: {
                game: { name: "Chess" },
                site: { name: "Abstract Play", gameid: "chess-1" },
                "date-end": "2026-08-19T14:30:00.000Z",
                players: [
                    { name: "a", userid: "user-a", result: 1 },
                    { name: "b", userid: "user-b", result: 0 },
                ],
            },
            moves: [["e4"], ["e5"]],
        };
        accumulateSoloRecord(state, rec);
        expect(buildSoloMetaStats(state)).toEqual({});
        expect(buildSoloSeedBoards(state)).toEqual([]);
    });
});
