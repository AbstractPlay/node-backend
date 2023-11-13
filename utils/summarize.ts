// tslint:disable: no-console
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand, type CreateInvalidationCommandInput } from "@aws-sdk/client-cloudfront";
import { Handler } from "aws-lambda";
import { type IRating, type APGameRecord, ELOBasic } from "@abstractplay/recranks";
// import { nanoid } from "nanoid";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const cloudfront = new CloudFrontClient({region: REGION});
const REC_BUCKET = "records.abstractplay.com";

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
}

interface GameNumber {
    game: string;
    value: number;
}

interface UserNumber {
    user: string;
    value: number;
}

interface TwoPlayerStats {
    n: number;
    lenAvg: number;
    lenMedian: number;
    winsFirst: number;
}

interface GameNumList {
    game: string;
    value: number[];
}

type GameSummary = {
    numGames: number;
    numPlayers: number;
    oldestRec?: string;
    newestRec?: string;
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
    };
    histograms: {
        all: number[];
        meta: GameNumList[];
    };
    recent: GameNumber[];
    hoursPer: number[];
    metaStats: {
        [k: string]: TwoPlayerStats;
    }
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
        }
        const numPlayers = playerIDs.size;

        // META STATS
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
                    }
                }
            }
            if (n > 0) {
                const wins = fpWins / n;
                const sum = lengths.reduce((prev, curr) => prev + curr, 0);
                const avg = sum / lengths.length;
                lengths.sort();
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

        // rate the records for each game
        const rater = new ELOBasic();
        // collate list of raw ratings right here and now
        const rawList: UserGameRating[] = [];
        for (const [meta, recs] of meta2recs.entries()) {
            const results = rater.runProcessed(recs);
            console.log(`Rating records for "${meta}":\nTotal records: ${results.recsReceived}, Num rated: ${results.recsRated}\n${results.warnings !== undefined ? results.warnings.join("\n") + "\n" : ""}${results.errors !== undefined ? results.errors.join("\n") + "\n" : ""}`);
            for (const rating of results.ratings.values()) {
                rating.gamename = meta;
                const [,userid] = rating.userid.split("|");
                rating.userid = userid;
                ratingList.push({user: userid, game: meta, rating});
                rawList.push({user: userid, game: meta, rating: Math.round(rating.rating)});
            }
        }

        const ratedGames = new Set<string>(ratingList.map(r => r.game));
        const ratedPlayers = new Set<string>(ratingList.map(r => r.user));

        // LISTS OF RATINGS
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
            topPlayers.push({user: top.user, game: g, rating: Math.round(top.rating.rating)});
        }

        // POPULAR GAMES
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

        // HISTOGRAMS
        const histList: {game: string; bucket: number}[] = [];
        const baseline = Date.now();
        // all first
        for (const rec of recs) {
            const completed = (new Date(rec.header["date-end"])).getTime();
            const daysAgo = (baseline - completed) / (24 * 60 * 60 * 1000);
            const bucket = Math.floor(daysAgo / 7);
            histList.push({game: rec.header.game.name, bucket});
        }
        const histAll: number[] = [];
        const maxBucket = Math.max(...histList.map(x => x.bucket));
        for (let i = 0; i <= maxBucket; i++) {
            histAll.push(histList.filter(x => x.bucket === i).length);
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

        // DAYS PER MOVE
        const hoursPer: number[] = [];
        for (const rec of recs) {
            if (rec.header["date-start"] !== undefined) {
                const started = (new Date(rec.header["date-start"])).getTime();
                const completed = (new Date(rec.header["date-end"])).getTime();
                const duration = completed - started;
                const numMoves = (rec.moves as any[]).map(m => m.length).reduce((prev, curr) => prev + curr, 0);
                const secsPer = duration / numMoves;
                hoursPer.push(secsPer / (60 * 60 * 1000));
            }
        }

        const summary: GameSummary = {
            numGames,
            numPlayers,
            oldestRec: oldest,
            newestRec: newest,
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
                social
            },
            histograms: {
                all: histAll,
                meta: histMeta,
            },
            hoursPer,
            recent,
            metaStats,
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

        // invalidate CloudFront distribution
        const cfParams: CreateInvalidationCommandInput = {
            DistributionId: "EM4FVU08T5188",
            InvalidationBatch: {
                CallerReference: Date.now().toString(),
                Paths: {
                    Quantity: 1,
                    Items: ["/*"],
                },
            },
        };
        const cfCmd = new CreateInvalidationCommand(cfParams);
        const cfResponse = await cloudfront.send(cfCmd);
        if (cfResponse["$metadata"].httpStatusCode !== 200) {
            console.log(cfResponse);
        }
        console.log("Invalidation sent");
    }
}
