// tslint:disable: no-console
import { S3Client, GetObjectCommand, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { IRating, APGameRecord, ELOBasic } from "@abstractplay/recranks";
// import { nanoid } from "nanoid";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const REC_BUCKET = "records.abstractplay.com";

type RatingList = {
    [k: string]: {
        [k: string]: IRating;
    }
};

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
    },
    players: {
        social: UserNumber[];
        eclectic: UserNumber[];
        allPlays: UserNumber[];
    },
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
        const g2p2r: RatingList = {};
        const p2g2r: RatingList = {};
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
        const metaStats: {[k: string]: TwoPlayerStats} = {};
        for (const [game, recs] of meta2recs.entries()) {
            let n = 0;
            let fpWins = 0;
            const length: number[] = [];
            for (const rec of recs) {
                if ( (rec.header.players.length === 2) && (rec.moves.length > 2) ) {
                    n++;
                    length.push(rec.moves.length);
                    if (rec.header.players[0].result > rec.header.players[1].result) {
                        fpWins++;
                    }
                }
            }
            if (n > 0) {
                const wins = fpWins / n;
                const sum = length.reduce((prev, curr) => prev + curr, 0);
                const avg = sum / length.length;
                length.sort();
                let median: number;
                if (length.length % 2 === 0) {
                    const rightIdx = length.length / 2;
                    const leftIdx = rightIdx - 1;
                    median = (length[leftIdx] + length[rightIdx]) / 2;
                } else {
                    median = length[Math.floor(length.length / 2)];
                }
                metaStats[game] = {
                    n,
                    lenAvg: avg,
                    lenMedian: median,
                    winsFirst: wins,
                };
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
                if (meta in g2p2r) {
                    g2p2r[meta][userid] = rating;
                } else {
                    g2p2r[meta] = {[userid]: rating}
                }
                if (meta in p2g2r) {
                    p2g2r[userid][meta] = rating;
                } else {
                    p2g2r[userid] = {[meta]: rating}
                }
                rawList.push({user: userid, game: meta, rating: Math.round(rating.rating)});
            }
        }

        // LISTS OF RATINGS
        // raw [see `rawList` above]
        // average rating
        const avgRatings: UserRating[] = [];
        for (const p of Object.keys(p2g2r)) {
            const ratings = [...Object.values(p2g2r[p])].map(r => r.rating);
            const sum = ratings.reduce((prev, curr) => prev + curr, 0);
            const avg = Math.round(sum / ratings.length);
            avgRatings.push({user: p, rating: avg});
        }
        // average rating, weighted by number of plays
        const weightedRatings: UserRating[] = [];
        for (const p of Object.keys(p2g2r)) {
            const counts = [...Object.values(p2g2r[p])].map(r => r.recCount);
            const totalRecs = counts.reduce((prev, curr) => prev + curr, 0);
            const ratings = [...Object.values(p2g2r[p])].map(r => r.rating * (r.recCount / totalRecs));
            const sum = ratings.reduce((prev, curr) => prev + curr, 0);
            const avg = Math.round(sum);
            weightedRatings.push({user: p, rating: avg});
        }

        // TOP PLAYERS
        const topPlayers: UserGameRating[] = [];
        for (const g of Object.keys(g2p2r)) {
            const ratings = [...Object.values(g2p2r[g])];
            ratings.sort((a, b) => b.rating - a.rating);
            const top = ratings[0];
            topPlayers.push({user: top.userid, game: g, rating: Math.round(top.rating)});
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
    }
}
