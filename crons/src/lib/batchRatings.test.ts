import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import {
    assignTournamentPlayerRatings,
    batchRatingGameLabel,
    buildPlayerCountsByUid,
    compareBatchRatings,
    defaultGlickoPrior,
    GLICKO_PRIOR_RATING_LOW,
    lookupBatchRating,
    parseBatchRatingGameLabel,
} from "./batchRatings.js";
import { GLICKO_RATING_START, GLICKO_RD_START } from "../functions/summarizeHelpers.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../test/fixtures");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "batch-ratings.json"), "utf8")) as {
    highest: UserGameRating[];
};

describe("batchRatingGameLabel", () => {
    it("labels no variants", () => {
        expect(batchRatingGameLabel("chess", [])).toBe("chess (no variants)");
    });

    it("labels sorted variant UIDs", () => {
        expect(batchRatingGameLabel("go", ["handicap", "9x9"])).toBe("go (9x9|handicap)");
    });
});

describe("parseBatchRatingGameLabel", () => {
    it("parses no variants", () => {
        expect(parseBatchRatingGameLabel("chess (no variants)")).toEqual({
            metaUid: "chess",
            variantUids: [],
        });
    });

    it("parses variant UIDs", () => {
        expect(parseBatchRatingGameLabel("go (9x9|handicap)")).toEqual({
            metaUid: "go",
            variantUids: ["9x9", "handicap"],
        });
    });

    it("round-trips batchRatingGameLabel", () => {
        const label = batchRatingGameLabel("go", ["handicap", "9x9"]);
        expect(parseBatchRatingGameLabel(label)).toEqual({
            metaUid: "go",
            variantUids: ["9x9", "handicap"],
        });
    });
});

describe("defaultGlickoPrior", () => {
    it("uses 1200/350 start aligned with batch Elo", () => {
        const prior = defaultGlickoPrior();
        expect(prior.rating).toBe(GLICKO_RATING_START);
        expect(prior.rd).toBe(GLICKO_RD_START);
        expect(prior.ratingLow).toBe(GLICKO_RATING_START - 2 * GLICKO_RD_START);
    });
});

describe("lookupBatchRating", () => {
    it("finds an existing row", () => {
        const row = lookupBatchRating(fixture.highest, "chess", [], "alice");
        expect(row.user).toBe("alice");
        expect(row.glicko?.ratingLow).toBe(1200);
    });

    it("returns prior for missing user", () => {
        const row = lookupBatchRating(fixture.highest, "chess", [], "unknown");
        expect(row.glicko?.rating).toBe(1200);
        expect(row.glicko?.ratingLow).toBe(500);
    });

    it("matches variant label keys", () => {
        const row = lookupBatchRating(fixture.highest, "go", ["9x9", "handicap"], "carol");
        expect(row.glicko?.ratingLow).toBe(1170);
    });
});

describe("compareBatchRatings", () => {
    it("sorts by ratingLow descending", () => {
        const sorted = [...fixture.highest.filter((r) => r.game === "chess (no variants)")].sort(
            compareBatchRatings,
        );
        expect(sorted[0]!.user).toBe("alice");
        expect(sorted[1]!.user).toBe("bob");
    });

    it("tie-breaks lower rd before higher raw rating", () => {
        const a: UserGameRating = {
            user: "a",
            game: "Test (no variants)",
            rating: 1200,
            wld: [0, 0, 0],
            glicko: {
                rating: 1300,
                rd: 50,
                volatility: 0.06,
                ratingLow: 1200,
                ratingHigh: 1400,
                provisional: false,
                established: false,
                n: 5,
            },
        };
        const b: UserGameRating = {
            user: "b",
            game: "Test (no variants)",
            rating: 1200,
            wld: [0, 0, 0],
            glicko: {
                rating: 1350,
                rd: 75,
                volatility: 0.06,
                ratingLow: 1200,
                ratingHigh: 1500,
                provisional: false,
                established: false,
                n: 5,
            },
        };
        expect(compareBatchRatings(a, b)).toBeLessThan(0);
    });
});

describe("buildPlayerCountsByUid", () => {
    it("counts distinct users per meta uid", () => {
        const counts = buildPlayerCountsByUid(fixture.highest);
        expect(counts).toEqual({ chess: 2, go: 2 });
    });
});

describe("assignTournamentPlayerRatings", () => {
    it("orders players by glicko ratingLow descending", () => {
        const players = [
            { playerid: "bob", playername: "Bob" },
            { playerid: "alice", playername: "Alice" },
            { playerid: "unknown", playername: "Unknown" },
        ];
        assignTournamentPlayerRatings(players, fixture.highest, "chess", []);
        players.sort((a, b) => b.rating! - a.rating!);
        expect(players.map((p) => p.playerid)).toEqual(["alice", "bob", "unknown"]);
        expect(players[0]!.rating).toBe(1200);
        expect(players[1]!.rating).toBe(1090);
        expect(players[2]!.rating).toBe(GLICKO_PRIOR_RATING_LOW);
    });

    it("uses variant-aware game labels", () => {
        const players = [
            { playerid: "carol" },
            { playerid: "alice" },
        ];
        assignTournamentPlayerRatings(players, fixture.highest, "go", ["handicap", "9x9"]);
        players.sort((a, b) => b.rating! - a.rating!);
        expect(players[0]!.playerid).toBe("alice");
        expect(players[0]!.rating).toBe(1200);
        expect(players[1]!.rating).toBe(1170);
    });
});
