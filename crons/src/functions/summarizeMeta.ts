import { GetObjectCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import {
    type APGameRecord,
    ELOBasic,
    Glicko2,
    type IGlickoRating,
    type IRating,
    type ITrueskillRating,
    Trueskill,
} from "@abstractplay/recranks";
import { replacer } from "@abstractplay/gameslib";
import type { TwoPlayerStats } from "types/stats/TwoPlayerStats.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import type { UserNumber } from "types/stats/UserNumber.js";
import {
    GLICKO_PERIOD_MS,
    GLICKO_RATING_START,
    GLICKO_RD_START,
    calcTwoPlayerStats,
    computeGlickoNumPeriods,
    hIndexFromCounts,
    partitionByGlickoPeriod,
    variantComboFromRecord,
    type RecordGameIdFallback,
    toGlickoStats,
} from "./summarizeHelpers.js";
import { batchRatingGameLabel } from "../lib/batchRatings.js";

export type RatingListEntry = {
    user: string;
    game: string;
    rating: IRating;
};

export async function listMetaShardKeys(s3: S3Client, bucket: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "meta/",
            ContinuationToken: continuationToken,
        }));
        for (const obj of response.Contents ?? []) {
            const key = obj.Key;
            if (key === undefined || !key.endsWith(".json")) {
                continue;
            }
            const metaUid = key.slice("meta/".length, -".json".length);
            if (metaUid.length > 0) {
                keys.push(metaUid);
            }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    keys.sort();
    return keys;
}

export async function loadMetaShard(
    s3: S3Client,
    bucket: string,
    metaUid: string,
): Promise<APGameRecord[]> {
    const response = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: `meta/${metaUid}.json`,
    }));
    const str = await response.Body?.transformToString();
    if (str === undefined) {
        throw new Error(`Unable to load meta/${metaUid}.json`);
    }
    return JSON.parse(str) as APGameRecord[];
}

export function buildMetaStatsForGame(
    recs: APGameRecord[],
    metaUid: string,
    fallback?: RecordGameIdFallback,
): Record<string, TwoPlayerStats> {
    const metaStats: Record<string, TwoPlayerStats> = {};
    const combined = calcTwoPlayerStats(recs);
    if (combined !== undefined) {
        metaStats[metaUid] = combined;
    }
    const allVariants = new Set(recs.map((r) => variantComboFromRecord(r, fallback)));
    if (allVariants.size > 1) {
        for (const combo of allVariants) {
            const subset = recs.filter((r) => variantComboFromRecord(r, fallback) === combo);
            const substats = calcTwoPlayerStats(subset);
            const variants = combo === "" ? [] : combo.split("|");
            const metaName = batchRatingGameLabel(metaUid, variants);
            if (substats !== undefined) {
                metaStats[metaName] = substats;
            }
        }
    }
    return metaStats;
}

export function buildHMetaForGame(
    recs: APGameRecord[],
    metaUid: string,
): UserNumber | undefined {
    const counts = new Map<string, number>();
    for (const rec of recs) {
        for (const prec of rec.header.players) {
            if (prec.userid === undefined) {
                continue;
            }
            counts.set(prec.userid, (counts.get(prec.userid) ?? 0) + 1);
        }
    }
    if (counts.size === 0) {
        return undefined;
    }
    return { user: metaUid, value: hIndexFromCounts(counts.values()) };
}

export function rateMetaGameVariants(
    recs: APGameRecord[],
    metaUid: string,
    rater: ELOBasic,
    ratingList: RatingListEntry[],
    rawList: UserGameRating[],
    fallback?: RecordGameIdFallback,
): void {
    if (recs.length === 0) {
        return;
    }
    const allVariants = new Set(recs.map((r) => variantComboFromRecord(r, fallback)));
    if (allVariants.size === 0) {
        return;
    }
    for (const combo of allVariants) {
        console.log(`Rating game ${metaUid}, variant grouping ${combo}`);
        const subset = recs.filter((r) => variantComboFromRecord(r, fallback) === combo);
        const variants = combo === "" ? [] : combo.split("|");
        const metaName = batchRatingGameLabel(metaUid, variants);

        const results = rater.runProcessed(subset);
        console.log(
            `Elo rater:\nTotal records: ${results.recsReceived}, Num rated: ${results.recsRated}\n${
                results.warnings !== undefined ? results.warnings.join("\n") + "\n" : ""
            }${results.errors !== undefined ? results.errors.join("\n") + "\n" : ""}`,
        );
        for (const rating of results.ratings.values()) {
            rating.gamename = metaUid;
            const [, userid] = rating.userid.split("|");
            rating.userid = userid;
            ratingList.push({ user: userid, game: metaName, rating });
        }

        console.log("Running Trueskill ratings");
        const ts = new Trueskill({ betaStart: 25 / 9 });
        const tsResults = ts.runProcessed(subset);
        const tsRatings = new Map(tsResults.ratings) as Map<string, ITrueskillRating>;
        if (ratingList.filter((r) => r.game === metaName).length !== tsRatings.size) {
            const metaRatings = ratingList.filter((r) => r.game === metaName);
            const elo = new Set(metaRatings.map((r) => r.user));
            const tsVals = new Set(
                [...tsRatings.values()].map((r) => {
                    const [, u] = r.userid.split("|");
                    return u;
                }),
            );
            const inElo = [...elo.values()].filter((u) => !tsVals.has(u));
            const inTS = [...tsVals.values()].filter((u) => !elo.has(u));
            throw new Error(
                `The list of Elo ratings is not the same length as the list of Trueskill ratings.\nList of Elo ratings not in Trueskill: ${JSON.stringify(inElo, null, 2)}\nList of Trueskill ratings not in Elo: ${JSON.stringify(inTS, null, 2)}\nTrueskill ratings: ${JSON.stringify(tsRatings, replacer, 2)}`,
            );
        }
        console.log(`Final Trueskill ratings:\n${JSON.stringify([...tsRatings.values()])}`);

        console.log("Running Glicko2 ratings");
        const glicko = new Glicko2({
            ratingStart: GLICKO_RATING_START,
            rdStart: GLICKO_RD_START,
        });
        const oldest = new Date(
            subset.map((r) => r.header["date-end"]).sort((a, b) => a.localeCompare(b))[0]!,
        );
        const newest = new Date(
            subset.map((r) => r.header["date-end"]).sort((a, b) => b.localeCompare(a))[0]!,
        );
        console.log(`Oldest: ${oldest}, Newest: ${newest}`);
        const oldestMs = oldest.getTime();
        const delta = newest.getTime() - oldestMs;
        const period = GLICKO_PERIOD_MS;
        const numPeriods = computeGlickoNumPeriods(delta, period);
        console.log(`Number of periods: ${numPeriods}`);
        const dated = subset.map((rec) => ({
            rec,
            dateEndMs: new Date(rec.header["date-end"]).getTime(),
        }));
        const buckets = partitionByGlickoPeriod(dated, oldestMs, period, numPeriods);
        let toDate = new Map<string, IGlickoRating>();
        let ratedRecs = 0;
        for (let p = 0; p < numPeriods; p++) {
            glicko.knownRatings = new Map(toDate);
            const periodRecs = buckets[p]!.map((d) => d.rec);
            ratedRecs += periodRecs.length;
            const glickoResults = glicko.runProcessed(periodRecs);
            toDate = new Map(glickoResults.ratings as Map<string, IGlickoRating>);
        }
        if (ratedRecs !== subset.length) {
            throw new Error(
                `The record subset had ${subset.length} records, but only ${ratedRecs} were handed to the rater.`,
            );
        }
        if (ratingList.filter((r) => r.game === metaName).length !== toDate.size) {
            const metaRatings = ratingList.filter((r) => r.game === metaName);
            const elo = new Set(metaRatings.map((r) => r.user));
            const glickoUsers = new Set(
                [...toDate.values()].map((r) => {
                    const [, u] = r.userid.split("|");
                    return u;
                }),
            );
            const inElo = [...elo.values()].filter((u) => !glickoUsers.has(u));
            const inGlicko = [...glickoUsers.values()].filter((u) => !elo.has(u));
            throw new Error(
                `The list of Elo ratings is not the same length as the list of Glicko ratings.\nList of Elo ratings not in Glicko: ${JSON.stringify(inElo, null, 2)}\nList of Glicko ratings not in Elo: ${JSON.stringify(inGlicko, null, 2)}\nGlicko ratings: ${JSON.stringify(toDate, replacer, 2)}`,
            );
        }
        console.log(`Final glicko rating results: ${JSON.stringify(toDate, replacer)}`);

        for (const userStr of toDate.keys()) {
            const [, user] = userStr.split("|");
            const elo = ratingList.find((r) => r.user === user && r.game === metaName)?.rating;
            if (elo === undefined) {
                throw new Error(`Could not find a matching Elo rating for ${user}.`);
            }
            const ts = tsRatings.get(userStr);
            if (ts === undefined) {
                throw new Error(`Could not find a matching Trueskill rating for ${user}.`);
            }
            const glickoRating = toDate.get(userStr)!;
            if (elo.recCount !== glickoRating.recCount) {
                throw new Error("Rated recCounts do not match.");
            }
            if (elo.recCount !== ts.recCount) {
                throw new Error(
                    `Rated recCounts do not match for user ${user}:\nElo: ${elo.recCount}\nTrueskill: ${ts.recCount}`,
                );
            }
            rawList.push({
                user,
                game: metaName,
                rating: Math.round(elo.rating),
                wld: [elo.wins, elo.losses, elo.draws],
                glicko: toGlickoStats(
                    glickoRating.rating,
                    glickoRating.rd,
                    glickoRating.volatility,
                    glickoRating.recCount,
                ),
                trueskill: { mu: ts.rating, sigma: ts.sigma },
            });
        }
    }
}
