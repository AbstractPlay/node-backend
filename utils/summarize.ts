// tslint:disable: no-console
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { isoToCountryCode } from "../lib/isoToCountryCode";
import { Handler } from "aws-lambda";
import { type IRating, type IGlickoRating, APGameRecord, ELOBasic, Glicko2, type ITrueskillRating, Trueskill } from "@abstractplay/recranks";
import { replacer } from "@abstractplay/gameslib/build/src/common";
// import { nanoid } from "nanoid";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const REC_BUCKET = "records.abstractplay.com";
const clnt = new DynamoDBClient({ region: REGION });
const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);

type RatingList = {
    user: string;
    game: string;
    rating: IRating;
}[];

interface UserRating {
    user: string;
    rating: number;
}

interface UserGameRating extends UserRating {
    game: string;
    wld: [number,number,number];
    glicko?: {rating: number; rd: number};
    trueskill?: {mu: number; sigma: number};
}

interface GameNumber {
    game: string;
    value: number;
}

interface GameNumList {
    game: string;
    value: number[];
}

interface UserNumber {
    user: string;
    value: number;
}

interface UserNumList {
    user: string;
    value: number[];
}

interface TwoPlayerStats {
    n: number;
    lenAvg: number;
    lenMedian: number;
    winsFirst: number;
}

interface GeoStats {
    code: string;
    name: string;
    n: number;
}

type StatSummary = {
    numGames: number;
    numPlayers: number;
    oldestRec?: string;
    newestRec?: string;
    timeoutRate: number;
    ratings: {
        highest: UserGameRating[];
        avg: UserRating[];
        weighted: UserRating[];
    };
    topPlayers: UserGameRating[];
    plays: {
        total: GameNumber[];
        width: GameNumber[];
    };
    players: {
        social: UserNumber[];
        eclectic: UserNumber[];
        allPlays: UserNumber[];
        h: UserNumber[];
        hOpp: UserNumber[];
        timeouts: UserNumber[];
    };
    histograms: {
        all: number[];
        allPlayers: number[];
        meta: GameNumList[];
        players: UserNumList[];
        playerTimeouts: UserNumList[];
        firstTimers: number[];
        timeouts: number[];
    };
    recent: GameNumber[];
    hoursPer: number[];
    metaStats: {
        [k: string]: TwoPlayerStats;
    }
    geoStats: GeoStats[];
};

const pushToMap = (map: Map<string, any[]>, key: string, value: any) => {
    if (map.has(key)) {
        const lst = map.get(key)!;
        map.set(key, [...lst, value]);
    } else {
        map.set(key, [value])
    }
}

export const handler: Handler = async (event: any, context?: any) => {
    // scan bucket for data folder
    const command = new GetObjectCommand({
        Bucket: REC_BUCKET,
        Key: "ALL.json",
    });

    let recs: APGameRecord[]|undefined;
    try {
        console.log("Loading all game records");
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        const str = await response.Body?.transformToString();
        if (str !== undefined) {
            recs = JSON.parse(str) as APGameRecord[];
        } else {
            throw new Error("Unable to load ALL.json file");
        }
    } catch (err) {
        console.log(`Error occurred loading ALL.json file: ${err}`)
    }

    if (recs !== undefined) {
        const numGames = recs.length;
        const playerIDs = new Set<string>();
        const meta2recs = new Map<string, APGameRecord[]>();
        const player2recs = new Map<string, APGameRecord[]>();
        const ratingList: RatingList = [];
        let oldest: string|undefined;
        let newest: string|undefined;
        const timeouts: UserNumber[] = [];
        const siteTimeouts: number[] = [];

        console.log("Segmenting records by meta and player");
        for (const rec of recs) {
            // get list of unique player IDs for numPlayers
            // separate records by player
            for (const p of rec.header.players) {
                if (p.userid !== undefined) {
                    playerIDs.add(p.userid);
                    pushToMap(player2recs, p.userid, rec);
                }
            }
            // separate records by meta
            pushToMap(meta2recs, rec.header.game.name, rec);
            // track newest/oldest records
            if (oldest === undefined) {
                oldest = rec.header["date-end"]
            } else {
                const sorted = [oldest, rec.header["date-end"]].sort((a, b) => a.localeCompare(b));
                oldest = sorted[0];
            }
            if (newest === undefined) {
                newest = rec.header["date-end"]
            } else {
                const sorted = [newest, rec.header["date-end"]].sort((a, b) => b.localeCompare(a));
                newest = sorted[0];
            }
            // find timeouts
            const moveStr = JSON.stringify(rec.moves);
            // if abandoned, assign timeout to all players
            if (moveStr.includes("abandoned")) {
                const datems = new Date(rec.header["date-end"]).getTime();
                siteTimeouts.push(datems);
                for (const p of rec.header.players) {
                    timeouts.push({user: p.userid!, value: datems});
                }
            }
            // if timeout, assign timeout to player who timed out
            else if (moveStr.includes("timeout")) {
                const datems = new Date(rec.header["date-end"]).getTime();
                siteTimeouts.push(datems);
                // find the specific move
                const fidx = rec.moves.findIndex(mvs => mvs.find(m => m !== null && (typeof m === "object" ? m.move === "timeout" : m === "timeout")));
                if (fidx !== -1) {
                    const mvs = rec.moves[fidx];
                    const midx = mvs.findIndex(m => m !== null && (typeof m === "object" ? m.move === "timeout" : m === "timeout"));
                    if (midx !== -1) {
                        const p = rec.header.players[midx];
                        timeouts.push({user: p.userid!, value: datems});
                    }
                }
            }
        }
        const numPlayers = playerIDs.size;
        const timeoutRate = siteTimeouts.length / recs.length;

        // META STATS
        console.log("Calculating meta stats");
        const calcStats = (recs: APGameRecord[]): TwoPlayerStats|undefined => {
            let n = 0;
            let fpWins = 0;
            const lengths: number[] = [];
            for (const rec of recs) {
                if ( (rec.header.players.length === 2) && (rec.moves.length > 2) ) {
                    n++;
                    lengths.push(rec.moves.length);
                    if (rec.header.players[0].result > rec.header.players[1].result) {
                        fpWins++;
                    } else if (rec.header.players[0].result === rec.header.players[1].result) {
                        fpWins += 0.5;
                    }
                }
            }
            if (n > 0) {
                const wins = fpWins / n;
                const sum = lengths.reduce((prev, curr) => prev + curr, 0);
                const avg = sum / lengths.length;
                lengths.sort((a,b) => a - b);
                let median: number;
                if (lengths.length % 2 === 0) {
                    const rightIdx = lengths.length / 2;
                    const leftIdx = rightIdx - 1;
                    median = (lengths[leftIdx] + lengths[rightIdx]) / 2;
                } else {
                    median = lengths[Math.floor(lengths.length / 2)];
                }
                return {
                    n,
                    lenAvg: avg,
                    lenMedian: median,
                    winsFirst: wins,
                };
            }
        }
        const sortVariants = (rec: APGameRecord): string => {
            if ( (rec.header.game.variants !== undefined) && (rec.header.game.variants.length > 0) ) {
                const lst = [...rec.header.game.variants];
                lst.sort();
                return lst.join("|");
            } else {
                return "";
            }
        }
        const metaStats: {[k: string]: TwoPlayerStats} = {};
        for (const [game, recs] of meta2recs.entries()) {
            const combined = calcStats(recs);
            if (combined !== undefined) {
                metaStats[game] = {
                    n: combined.n,
                    lenAvg: combined.lenAvg,
                    lenMedian: combined.lenMedian,
                    winsFirst: combined.winsFirst,
                };
            }
            const allVariants = new Set<string>(recs.map(r => sortVariants(r)));
            if (allVariants.size > 1) {
                for (const combo of allVariants) {
                    const subset = recs.filter(r => sortVariants(r) === combo);
                    const substats = calcStats(subset);
                    let metaName = `${game} (${combo})`;
                    if (combo === "") {
                        metaName = `${game} (no variants)`;
                    }
                    if (substats !== undefined) {
                        metaStats[metaName] = {
                            n: substats.n,
                            lenAvg: substats.lenAvg,
                            lenMedian: substats.lenMedian,
                            winsFirst: substats.winsFirst,
                        };
                    }
                }
            }
        }

        // rate the records for each game (now subdivided by variants)
        console.log("Rating records");
        const rater = new ELOBasic();
        // collate list of raw ratings right here and now
        const rawList: UserGameRating[] = [];
        for (const [meta, recs] of meta2recs.entries()) {
            const allVariants = new Set<string>(recs.map(r => sortVariants(r)));
            if (allVariants.size > 0) {
                for (const combo of allVariants) {
                    console.log(`Rating game ${meta}, variant grouping ${combo}`);
                    const subset = recs.filter(r => sortVariants(r) === combo);
                    let metaName = `${meta} (${combo})`;
                    if (combo === "") {
                        metaName = `${meta} (no variants)`;
                    }
                    // Elo ratings first
                    const results = rater.runProcessed(subset);
                    console.log(`Elo rater:\nTotal records: ${results.recsReceived}, Num rated: ${results.recsRated}\n${results.warnings !== undefined ? results.warnings.join("\n") + "\n" : ""}${results.errors !== undefined ? results.errors.join("\n") + "\n" : ""}`);
                    for (const rating of results.ratings.values()) {
                        rating.gamename = meta;
                        const [,userid] = rating.userid.split("|");
                        rating.userid = userid;
                        ratingList.push({user: userid, game: metaName, rating});
                    }

                    // now Trueskill
                    console.log(`Running Trueskill ratings`);
                    const ts = new Trueskill({betaStart: 25/9});
                    const tsResults = ts.runProcessed(subset);
                    const tsRatings = new Map(tsResults.ratings) as Map<string, ITrueskillRating>;
                    if (ratingList.filter(r => r.game === metaName).length !== tsRatings.size) {
                        const elo = new Set<string>(ratingList.map(r => r.user));
                        const tsVals = new Set<string>([...tsRatings.values()].map(r => {const [,u] = r.userid.split("|"); return u;}))
                        const inElo = [...elo.values()].filter(u => ! tsVals.has(u));
                        const inTS = [...tsVals.values()].filter(u => ! elo.has(u));
                        throw new Error(`The list of Elo ratings is not the same length as the list of Trueskill ratings.\nList of Elo ratings not in Trueskill: ${JSON.stringify(inElo, null, 2)}\nList of Trueskill ratings not in Elo: ${JSON.stringify(inTS, null, 2)}\nTrueskill ratings: ${JSON.stringify(tsRatings, replacer, 2)}`);
                    }
                    console.log(`Final Trueskill ratings:\n${JSON.stringify([...tsRatings.values()])}`)

                    // now Glicko
                    console.log(`Running Glicko2 ratings`);
                    const glicko = new Glicko2();
                    // get earliest and latest dates for subset
                    const oldest = new Date(subset.map(r => r.header["date-end"]).sort((a, b) => a.localeCompare(b))[0]);
                    const newest = new Date(subset.map(r => r.header["date-end"]).sort((a, b) => b.localeCompare(a))[0]);
                    console.log(`Oldest: ${oldest}, Newest: ${newest}`);
                    const delta = newest.getTime() - oldest.getTime();
                    const period = 60 * 24 * 60 * 60 * 1000;
                    let numPeriods = Math.ceil(delta / period);
                    if (numPeriods === 0) { numPeriods++; }
                    console.log(`Number of periods: ${numPeriods}`);
                    let toDate = new Map<string, IGlickoRating>();
                    let ratedRecs = 0;
                    for (let p = 0; p < numPeriods; p++) {
                        glicko.knownRatings = new Map(toDate);
                        const pMin = oldest.getTime() + (p * period);
                        const pMax = oldest.getTime() + ((p + 1) * period)
                        const recs: APGameRecord[] = [];
                        for (const rec of subset) {
                            const secs = new Date(rec.header["date-end"]).getTime();
                            if ( (secs >= pMin) && (secs < pMax) ) {
                                recs.push(rec);
                            }
                        }
                        ratedRecs += recs.length;
                        const results = glicko.runProcessed(recs);
                        toDate = new Map(results.ratings as Map<string, IGlickoRating>);
                    }
                    if (ratedRecs !== subset.length) {
                        throw new Error(`The record subset had ${subset.length} records, but only ${ratedRecs} were handed to the rater.`);
                    }
                    // toDate now has the final rating results
                    if (ratingList.filter(r => r.game === metaName).length !== toDate.size) {
                        const elo = new Set<string>(ratingList.map(r => r.user));
                        const glicko = new Set<string>([...toDate.values()].map(r => {const [,u] = r.userid.split("|"); return u;}))
                        const inElo = [...elo.values()].filter(u => ! glicko.has(u));
                        const inGlicko = [...glicko.values()].filter(u => ! elo.has(u));
                        throw new Error(`The list of Elo ratings is not the same length as the list of Glicko ratings.\nList of Elo ratings not in Glicko: ${JSON.stringify(inElo, null, 2)}\nList of Glicko ratings not in Elo: ${JSON.stringify(inGlicko, null, 2)}\nGlicko ratings: ${JSON.stringify(toDate, replacer, 2)}`);
                    }
                    console.log(`Final glicko rating results: ${JSON.stringify(toDate, replacer)}`)

                    // Save Elo, Glicko2, and Trueskill ratings into rawList
                    for (const userStr of toDate.keys()) {
                        const [,user] = userStr.split("|");
                        const elo = ratingList.find(r => r.user === user && r.game === metaName)?.rating;
                        if (elo === undefined) {
                            throw new Error(`Could not find a matching Elo rating for ${user}.`);
                        }
                        const ts = tsRatings.get(userStr);
                        if (ts === undefined) {
                            throw new Error(`Could not find a matching Trueskill rating for ${user}.`);
                        }
                        const glicko = toDate.get(userStr)!;
                        if (elo.recCount !== glicko.recCount) {
                            throw new Error(`Rated recCounts do not match.`);
                        }
                        if (elo.recCount !== ts.recCount) {
                            throw new Error(`Rated recCounts do not match for user ${user}:\nElo: ${elo.recCount}\nTrueskill: ${glicko.recCount}`);
                        }
                        rawList.push({user, game: metaName, rating: Math.round(elo.rating), wld: [elo.wins, elo.losses, elo.draws], glicko: {rating: glicko.rating, rd: glicko.rd}, trueskill: {mu: ts.rating, sigma: ts.sigma}});
                    }
                }
            }
        }

        const ratedGames = new Set<string>(ratingList.map(r => r.game));
        const ratedPlayers = new Set<string>(ratingList.map(r => r.user));

        // LISTS OF RATINGS
        console.log("Summarizing ratings");
        // raw [see `rawList` above]
        // average rating
        const avgRatings: UserRating[] = [];
        for (const p of ratedPlayers) {
            const ratings = ratingList.filter(r => r.user === p).map(r => r.rating.rating);
            const sum = ratings.reduce((prev, curr) => prev + curr, 0);
            const avg = Math.round(sum / ratings.length);
            avgRatings.push({user: p, rating: avg});
        }
        // average rating, weighted by number of plays
        const weightedRatings: UserRating[] = [];
        for (const p of ratedPlayers) {
            const counts = ratingList.filter(r => r.user === p).map(r => r.rating.recCount);
            const totalRecs = counts.reduce((prev, curr) => prev + curr, 0);
            const ratings = ratingList.filter(r => r.user === p).map(r => r.rating.rating * (r.rating.recCount / totalRecs));
            const sum = ratings.reduce((prev, curr) => prev + curr, 0);
            const avg = Math.round(sum);
            weightedRatings.push({user: p, rating: avg});
        }

        // TOP PLAYERS
        const topPlayers: UserGameRating[] = [];
        for (const g of ratedGames) {
            const ratings = ratingList.filter(r => r.game === g);
            ratings.sort((a, b) => b.rating.rating - a.rating.rating);
            const top = ratings[0];
            topPlayers.push({user: top.user, game: g, rating: Math.round(top.rating.rating), wld: [top.rating.wins, top.rating.losses, top.rating.draws]});
        }

        // POPULAR GAMES
        console.log("Calculating play stats");
        // total plays
        const numPlays: GameNumber[] = [];
        for (const [game, recs] of meta2recs.entries()) {
            numPlays.push({game, value: recs.length});
        }
        // widely played
        const playWidth: GameNumber[] = [];
        for (const [game, recs] of meta2recs.entries()) {
            const users = new Set<string>();
            for (const rec of recs) {
                for (const p of rec.header.players) {
                    if (p.userid !== undefined) {
                        users.add(p.userid);
                    }
                }
            }
            playWidth.push({game, value: users.size});
        }

        // PLAYER STATISTICS
        console.log("Calculating player statistics");
        // all plays
        const allPlays: UserNumber[] = [];
        for (const [user, recs] of player2recs.entries()) {
            allPlays.push({user, value: recs.length});
        }
        // eclectic
        const eclectic: UserNumber[] = [];
        for (const [user, recs] of player2recs.entries()) {
            const games = new Set<string>();
            for (const rec of recs) {
                games.add(rec.header.game.name);
            }
            eclectic.push({user, value: games.size});
        }
        // social
        const social: UserNumber[] = [];
        for (const [user, recs] of player2recs.entries()) {
            const opps = new Set<string>();
            for (const rec of recs) {
                for (const p of rec.header.players) {
                    if (p.userid !== undefined) {
                        if (p.userid === user) {
                            continue;
                        } else {
                            opps.add(p.userid);
                        }
                    }
                }
            }
            social.push({user, value: opps.size});
        }
        // h-index
        const h: UserNumber[] = [];
        for (const [user, recs] of player2recs.entries()) {
            // console.log(`Calculating h-index for user ${user}`);
            const gameNames = new Set<string>(recs.map(r => r.header.game.name));
            // console.log(JSON.stringify([...gameNames.values()]));
            const counts = new Map<string, number>();
            for (const name of gameNames) {
                counts.set(name, recs.filter(r => r.header.game.name === name).length);
            }
            // console.log(JSON.stringify([...counts.entries()]));
            const sorted = [...counts.values()].sort((a, b) => b - a);
            let index = sorted.length;
            for (let i = 0; i < sorted.length; i++) {
                if (sorted[i] < i + 1) {
                    index = i;
                    break;
                }
            }
            // console.log(`h-index is ${index}`);
            h.push({user, value: index});
        }

        // h-index: opponents
        const hOpp: UserNumber[] = [];
        for (const [user, recs] of player2recs.entries()) {
            const counts = new Map<string, number>();
            recs.forEach(rec => {
                for (const player of rec.header.players) {
                    if (player.userid !== undefined && player.userid !== user) {
                        if (counts.has(player.userid)) {
                            const n = counts.get(player.userid)!;
                            counts.set(player.userid, n + 1);
                        } else {
                            counts.set(player.userid, 1);
                        }
                    }
                }
            });
            const sorted = [...counts.values()].sort((a, b) => b - a);
            let index = sorted.length;
            for (let i = 0; i < sorted.length; i++) {
                if (sorted[i] < i + 1) {
                    index = i;
                    break;
                }
            }
            hOpp.push({user, value: index});
        }

        // HISTOGRAMS
        console.log("Calculating histograms");
        const histList: {game: string; bucket: number}[] = [];
        const histListPlayers: {user: string; bucket: number}[] = [];
        const completedList: {user: string; time: number}[] = [];
        const histTimeoutBuckets: number[] = [];
        const histTimeouts: number[] = [];
        const earliest = Math.min(...recs.map(rec => new Date(rec.header["date-end"]).getTime()));
        // all first
        for (const rec of recs) {
            const completed = (new Date(rec.header["date-end"])).getTime();
            const daysAgo = (completed - earliest) / (24 * 60 * 60 * 1000);
            const bucket = Math.floor(daysAgo / 7);
            histList.push({game: rec.header.game.name, bucket});
            for (const player of rec.header.players) {
                histListPlayers.push({user: player.userid!, bucket});
                completedList.push({user: player.userid!, time: completed})
            }
        }

        // all games
        const histAll: number[] = [];
        const histAllPlayers: number[] = [];
        let maxBucket = Math.max(...histList.map(x => x.bucket));
        for (let i = 0; i <= maxBucket; i++) {
            histAll.push(histList.filter(x => x.bucket === i).length);
            const users = new Set<string>();
            for (const rec of histListPlayers.filter(x => x.bucket === i)) {
                users.add(rec.user);
            }
            histAllPlayers.push(users.size);
        }

        // timeouts
        for (const t of siteTimeouts) {
            const daysAgo = (t - earliest) / (24 * 60 * 60 * 1000);
            const bucket = Math.floor(daysAgo / 7);
            histTimeoutBuckets.push(bucket);
        }
        for (let i = 0; i <= Math.max(...histTimeoutBuckets); i++) {
            histTimeouts.push(histTimeoutBuckets.filter(x => x === i).length);
        }
        // convert to rate
        for (let i = 0; i < histTimeouts.length; i++) {
            histTimeouts[i] = histTimeouts[i] / histAll[i];
        }

        const histMeta: GameNumList[] = [];
        const recent: GameNumber[] = [];
        for (const meta of meta2recs.keys()) {
            const subset = histList.filter(x => x.game === meta);
            const maxBucket = Math.max(...subset.map(x => x.bucket));
            const lst: number[] = [];
            for (let i = 0; i <= maxBucket; i++) {
                lst.push(subset.filter(x => x.bucket === i).length);
            }
            histMeta.push({game: meta, value: [...lst]});
            const slice = lst.slice(-4);
            recent.push({game: meta, value: slice.reduce((prev, curr) => prev + curr, 0)});
        }

        // individual players
        const histPlayers: UserNumList[] = [];
        for (const userid of (new Set<string>(histListPlayers.map(x => x.user)))) {
            const subset = histListPlayers.filter(x => x.user === userid);
            const maxBucket = Math.max(...subset.map(x => x.bucket));
            const lst: number[] = [];
            for (let i = 0; i <= maxBucket; i++) {
                lst.push(subset.filter(x => x.bucket === i).length);
            }
            histPlayers.push({user: userid, value: [...lst]});
        }

        // individual player timeouts
        const histPlayerTimeouts: UserNumList[] = [];
        for (const userid of (new Set<string>(histListPlayers.map(x => x.user)))) {
            const toSubset = timeouts.filter(x => x.user === userid);
            const subset: {bucket: number}[] = [];
            for (const {value} of toSubset) {
                const daysAgo = (value - earliest) / (24 * 60 * 60 * 1000);
                const bucket = Math.floor(daysAgo / 7);
                subset.push({bucket});
            }
            const maxBucket = Math.max(...subset.map(x => x.bucket));
            const lst: number[] = [];
            for (let i = 0; i <= maxBucket; i++) {
                lst.push(subset.filter(x => x.bucket === i).length);
            }
            histPlayerTimeouts.push({user: userid, value: [...lst]});
        }

        // first timers
        const buckets: number[] = [];
        for (const userid of (new Set<string>(completedList.map(x => x.user)))) {
            const times = completedList.filter(x => x.user === userid).map(x => x.time);
            const localEarliest = Math.min(...times);
            const daysAgo = (localEarliest - earliest) / (24 * 60 * 60 * 1000);
            const bucket = Math.floor(daysAgo / 7);
            buckets.push(bucket);
        }
        const firstTimers: number[] = [];
        maxBucket = Math.max(...buckets);
        for (let i = 0; i <= maxBucket; i++) {
            firstTimers.push(buckets.filter(x => x === i).length);
        }

        // HOURS PER MOVE
        console.log("Calculating hours per move");
        const hoursPer: number[] = [];
        for (const rec of recs) {
            // omit "timeout" and "abandoned" records
            const moveStr = JSON.stringify(rec.moves);
            if ( (moveStr.includes("timeout")) || (moveStr.includes("abandoned")) || (rec.moves.length < 2) ) {
                // console.log(`Skipping record ${rec.header.site.gameid} because it contains a timeout move`)
                continue;
            }
            if (rec.header["date-start"] !== undefined) {
                const started = (new Date(rec.header["date-start"])).getTime();
                const completed = (new Date(rec.header["date-end"])).getTime();
                const duration = completed - started;
                const numMoves = (rec.moves as any[]).map(m => m.length).reduce((prev, curr) => prev + curr, 0);
                const secsPer = duration / numMoves;
                const hours = secsPer / (60 * 60 * 1000);
                if (hours > 200) {
                    console.log(`Excessive hoursPer found at record ${rec.header.site.gameid}`);
                }
                hoursPer.push(hours);
            }
        }

        // gathering geographical statistics
        let users: Record<string, any>[]|undefined;
        try {
            const data = await ddbDocClient.send(
              new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "USERS" },
                ExpressionAttributeNames: { "#pk": "pk"},
                ProjectionExpression: "sk, country",
                ReturnConsumedCapacity: "INDEXES"
              }));

            users = data.Items;
            if (users === undefined) {
              throw new Error("Found no users?");
            }
        } catch (err) {
            console.log(`An error occurred fetching USERS data: ${err}`);
            throw err;
        }
        const countryCounts = new Map<string, number>();
        for (const user of users) {
            const alpha2 = isoToCountryCode(user.country, "alpha2");
            if (alpha2 !== undefined) {
                if (countryCounts.has(alpha2)) {
                    const num = countryCounts.get(alpha2)!;
                    countryCounts.set(alpha2, num + 1);
                } else {
                    countryCounts.set(alpha2, 1);
                }
            }
        }
        const geoStats: GeoStats[] = [];
        for (const [alpha2, count] of countryCounts.entries()) {
            const name = isoToCountryCode(alpha2, "countryName");
            geoStats.push({code: alpha2, n: count, name: name || alpha2});
        }

        const summary: StatSummary = {
            numGames,
            numPlayers,
            oldestRec: oldest,
            newestRec: newest,
            timeoutRate,
            ratings: {
                highest: rawList,
                avg: avgRatings,
                weighted: weightedRatings,
            },
            topPlayers,
            plays: {
                total: numPlays,
                width: playWidth,
            },
            players: {
                allPlays,
                eclectic,
                social,
                h,
                hOpp,
                timeouts,
            },
            histograms: {
                all: histAll,
                allPlayers: histAllPlayers,
                playerTimeouts: histPlayerTimeouts,
                meta: histMeta,
                players: histPlayers,
                firstTimers,
                timeouts: histTimeouts,
            },
            hoursPer,
            recent,
            metaStats,
            geoStats,
        }
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: "_summary.json",
            Body: JSON.stringify(summary),
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }

        console.log("Analysis complete");
    }
}
