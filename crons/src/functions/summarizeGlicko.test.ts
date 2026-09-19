import { describe, expect, it } from "vitest";
import { Glicko2, type APGameRecord, type IGlickoRating } from "@abstractplay/recranks";
import {
    GLICKO_PERIOD_MS,
    GLICKO_RATING_START,
    GLICKO_RD_START,
    computeGlickoNumPeriods,
    partitionByGlickoPeriod,
} from "./summarizeHelpers.js";

function makeGameRecord(opts: {
    gameid: string;
    dateEnd: string;
    p1Userid: string;
    p2Userid: string;
    p1Result: number;
    p2Result: number;
}): APGameRecord {
    return {
        header: {
            game: { name: "Test" },
            site: { name: "Abstract Play", gameid: opts.gameid },
            "date-start": opts.dateEnd,
            "date-end": opts.dateEnd,
            "date-generated": opts.dateEnd,
            players: [
                { name: "A", userid: opts.p1Userid, result: opts.p1Result },
                { name: "B", userid: opts.p2Userid, result: opts.p2Result },
            ],
        },
        moves: [["e4", "e5"]],
    } as APGameRecord;
}

/** Mirrors summarize.ts multi-period Glicko loop for regression testing. */
function runSummarizeStyleGlicko(recs: APGameRecord[]): Map<string, IGlickoRating> {
    const glicko = new Glicko2({
        minRounds: 0,
        ratingStart: GLICKO_RATING_START,
        rdStart: GLICKO_RD_START,
    });
    const oldestMs = new Date(recs.map((r) => r.header["date-end"]).sort()[0]!).getTime();
    const newestMs = new Date(recs.map((r) => r.header["date-end"]).sort().at(-1)!).getTime();
    const delta = newestMs - oldestMs;
    const numPeriods = computeGlickoNumPeriods(delta, GLICKO_PERIOD_MS);
    const dated = recs.map((rec) => ({
        rec,
        dateEndMs: new Date(rec.header["date-end"]).getTime(),
    }));
    const buckets = partitionByGlickoPeriod(dated, oldestMs, GLICKO_PERIOD_MS, numPeriods);
    let toDate = new Map<string, IGlickoRating>();
    for (let p = 0; p < numPeriods; p++) {
        glicko.knownRatings = new Map(toDate);
        const results = glicko.runProcessed(buckets[p]!.map((d) => d.rec));
        toDate = new Map(results.ratings as Map<string, IGlickoRating>);
    }
    return toDate;
}

describe("summarize Glicko multi-period loop", () => {
    it("inflates RD for inactive players across an empty period", () => {
        const period0Rec = makeGameRecord({
            gameid: "g1",
            dateEnd: "2024-01-01T10:00:00Z",
            p1Userid: "alice",
            p2Userid: "bob",
            p1Result: 1,
            p2Result: 0,
        });
        const period1Rec = makeGameRecord({
            gameid: "g2",
            dateEnd: "2024-04-01T10:00:00Z",
            p1Userid: "alice",
            p2Userid: "carol",
            p1Result: 1,
            p2Result: 0,
        });

        const afterPeriod0 = runSummarizeStyleGlicko([period0Rec]);
        const bobAfterPeriod0 = afterPeriod0.get("Abstract Play|bob")!;
        const afterPeriod1 = runSummarizeStyleGlicko([period0Rec, period1Rec]);
        const bobAfterPeriod1 = afterPeriod1.get("Abstract Play|bob")!;

        expect(bobAfterPeriod1).toBeDefined();
        expect(bobAfterPeriod1!.rd).toBeGreaterThan(bobAfterPeriod0.rd);
        expect(bobAfterPeriod1!.rating).toBe(bobAfterPeriod0.rating);
    });
});
