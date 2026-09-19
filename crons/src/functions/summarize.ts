// tslint:disable: no-console
import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ELOBasic, type APGameRecord } from "@abstractplay/recranks";
import { Handler } from "aws-lambda";
import { isoToCountryCode } from "../utils/isoToCountryCode.js";
import { streamJsonArrayFromS3 } from "../utils/streamJsonArray.js";
import { alignWeeklyActiveMovers } from "../utils/moveSeasonality.js";
import { putRecordsJson } from "../utils/recordsJson.js";
import { gameinfo } from "@abstractplay/gameslib";
import { buildPlayerCountsByUid, compareBatchRatings } from "../lib/batchRatings.js";
import type { UserRating, StatSummary, RivalriesFull } from "types/index.js";
import type { UserGameRating } from "types/index.js";
import type { GeoStats } from "types/index.js";
import {
    GLICKO_PERIOD_MS,
    GLICKO_ESTABLISHED_RD,
    GLICKO_PROVISIONAL_RD,
    GLICKO_MIN_GAMES_ESTABLISHED,
    GLICKO_MIN_GAMES_PROVISIONAL,
    buildGlickoByGame,
    computeGlickoSiteRatings,
    computeGlickoGameCounts,
    computeGlickoSiteCounts,
    computeHoursPerStats,
    finalizeRivalryPairs,
    publishRivalries,
    enrichRivalryPairsWithDisplayNames,
    RIVALRY_MIN_GAMES,
    RIVALRY_PUBLIC_MIN_GAMES,
    splitStatSummary,
    type RecordGameIdFallback,
} from "./summarizeHelpers.js";
import {
    buildMetaStatsForGame,
    buildHMetaForGame,
    listMetaShardKeys,
    loadMetaShard,
    rateMetaGameVariants,
    type RatingListEntry,
} from "./summarizeMeta.js";
import {
    buildPieRates,
    buildPlayerCountMix,
    buildPlayStats,
    buildPlayerStats,
    buildSiteHistograms,
    buildPastDisplayNamesList,
    createSummarizeScanState,
    scanRecord,
    type GameInfoFlags,
} from "./summarizeScan.js";
import {
    accumulateSoloRecord,
    buildSoloMetaStats,
    buildSoloSeedBoards,
    createSoloSummarizeState,
} from "./summarizeSolo.js";

const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });
const REC_BUCKET = "records.abstractplay.com";
const MVTIMES_KEY = "mvtimes.json";
const OPS_BUCKET = "private-ops-153672715141-us-east-1-an";
const RIVALRIES_OPS_KEY = "stats/rivalries.json";
const clnt = new DynamoDBClient({ region: REGION });
const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
};
const unmarshallOptions = {
    wrapNumbers: false,
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);

async function putSummaryJson(key: string, body: unknown): Promise<number> {
    return putRecordsJson(s3, key, body);
}

function emptyMoveSeasonality() {
    return {
        movesByDow: Array.from({ length: 7 }, () => 0),
        playersByDow: Array.from({ length: 7 }, () => 0),
        movesByHour: Array.from({ length: 24 }, () => 0),
        windowDays: 365,
    };
}

async function loadMvtimes(): Promise<{
    seasonality: ReturnType<typeof emptyMoveSeasonality>;
    weeklyActiveMovers?: { originMs: number; byWeek: number[] };
}> {
    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: REC_BUCKET,
            Key: MVTIMES_KEY,
        }));
        const str = await response.Body?.transformToString();
        if (str === undefined) {
            return { seasonality: emptyMoveSeasonality() };
        }
        const parsed = JSON.parse(str) as {
            seasonality?: ReturnType<typeof emptyMoveSeasonality>;
            weeklyActiveMovers?: { originMs: number; byWeek: number[] };
        };
        if (parsed.seasonality === undefined) {
            console.log("mvtimes.json has no seasonality field; using empty bins");
        }
        return {
            seasonality: parsed.seasonality ?? emptyMoveSeasonality(),
            weeklyActiveMovers: parsed.weeklyActiveMovers,
        };
    } catch (err) {
        console.log(`Could not load ${MVTIMES_KEY}: ${err}`);
        return { seasonality: emptyMoveSeasonality() };
    }
}

function buildGameInfoByUid(): Map<string, GameInfoFlags> {
    const map = new Map<string, GameInfoFlags>();
    for (const info of gameinfo.values()) {
        map.set(info.uid, {
            name: info.name,
            flags: info.flags,
            playercounts: info.playercounts,
        });
    }
    return map;
}

export const handler: Handler = async () => {
    const gameInfoByUid = buildGameInfoByUid();
    const legacyRecordStats = { legacyGameIds: 0, legacyVariantFallbacks: 0 };
    const recordGameIdFallback: RecordGameIdFallback = {
        resolveMetaUidFromDisplayName: (displayName) => {
            const found = [...gameinfo.values()].find((i) => i.name === displayName);
            return found?.uid;
        },
        onLegacyGameId: () => {
            legacyRecordStats.legacyGameIds++;
        },
        onLegacyVariantFallback: () => {
            legacyRecordStats.legacyVariantFallbacks++;
        },
    };
    const scanState = createSummarizeScanState();
    const soloState = createSoloSummarizeState();

    console.log("Streaming all game records from ALL.json");
    try {
        const count = await streamJsonArrayFromS3<APGameRecord>(
            s3,
            REC_BUCKET,
            "ALL.json",
            (rec) => {
                scanRecord(scanState, rec, gameInfoByUid, recordGameIdFallback);
                accumulateSoloRecord(soloState, rec, recordGameIdFallback);
            },
        );
        if (count !== scanState.numGames) {
            throw new Error(`Stream count mismatch: ${count} vs ${scanState.numGames}`);
        }
        console.log(`Scanned ${count} records`);
        console.log(
            `Legacy gameid fallbacks: ${legacyRecordStats.legacyGameIds} records, `
                + `${legacyRecordStats.legacyVariantFallbacks} variant fallbacks`,
        );
    } catch (err) {
        console.log(`Error occurred streaming ALL.json: ${err}`);
        return;
    }

    if (scanState.numGames === 0) {
        console.log("No records found; skipping summarize");
        return;
    }

    const numGames = scanState.numGames;
    const numPlayers = scanState.playerIDs.size;
    const timeoutRate = scanState.siteEndFailures.length / numGames;
    const abandonedRate = scanState.siteAbandonments.length / numGames;
    const playContext = { casual: scanState.casualGames, event: scanState.eventGames };
    const earliest = scanState.earliestMs ?? 0;

    const pieRates = buildPieRates(scanState);
    const soloMetaStats = buildSoloMetaStats(soloState);
    const soloSeedBoards = buildSoloSeedBoards(soloState);
    const playerCountMix = buildPlayerCountMix(scanState);
    const { numPlays, playWidth } = buildPlayStats(scanState);
    const playerStats = buildPlayerStats(scanState);
    const histograms = buildSiteHistograms(scanState);

    console.log("Loading meta shards for per-game stats and ratings");
    const metaStats: StatSummary["metaStats"] = {};
    const hMeta: StatSummary["hMeta"] = [];
    const ratingList: RatingListEntry[] = [];
    const rawList: UserGameRating[] = [];
    const rater = new ELOBasic();

    const metaShardKeys = await listMetaShardKeys(s3, REC_BUCKET);
    console.log(`Found ${metaShardKeys.length} meta shards`);
    for (const metaUid of metaShardKeys) {
        const recs = await loadMetaShard(s3, REC_BUCKET, metaUid);
        if (recs.length === 0) {
            continue;
        }
        const hEntry = buildHMetaForGame(recs, metaUid);
        if (hEntry !== undefined) {
            hMeta.push(hEntry);
        }
        Object.assign(metaStats, buildMetaStatsForGame(recs, metaUid, recordGameIdFallback));
        rateMetaGameVariants(recs, metaUid, rater, ratingList, rawList, recordGameIdFallback);
    }

    const ratedGames = new Set(ratingList.map((r) => r.game));
    const ratedPlayers = new Set(ratingList.map((r) => r.user));

    console.log("Summarizing ratings");
    const avgRatings: UserRating[] = [];
    for (const p of ratedPlayers) {
        const ratings = ratingList.filter((r) => r.user === p).map((r) => r.rating.rating);
        const sum = ratings.reduce((prev, curr) => prev + curr, 0);
        avgRatings.push({ user: p, rating: Math.round(sum / ratings.length) });
    }
    const weightedRatings: UserRating[] = [];
    for (const p of ratedPlayers) {
        const counts = ratingList.filter((r) => r.user === p).map((r) => r.rating.recCount);
        const totalRecs = counts.reduce((prev, curr) => prev + curr, 0);
        const ratings = ratingList
            .filter((r) => r.user === p)
            .map((r) => r.rating.rating * (r.rating.recCount / totalRecs));
        const sum = ratings.reduce((prev, curr) => prev + curr, 0);
        weightedRatings.push({ user: p, rating: Math.round(sum) });
    }

    const glickoByGame = buildGlickoByGame(
        rawList
            .filter((row) => row.glicko !== undefined)
            .map((row) => ({ user: row.user, game: row.game, glicko: row.glicko! })),
    );
    const glickoSite = computeGlickoSiteRatings(glickoByGame);
    const glickoMeta = {
        establishedRd: GLICKO_ESTABLISHED_RD,
        provisionalRd: GLICKO_PROVISIONAL_RD,
        minGamesEstablished: GLICKO_MIN_GAMES_ESTABLISHED,
        minGamesProvisional: GLICKO_MIN_GAMES_PROVISIONAL,
        periodMs: GLICKO_PERIOD_MS,
        generatedAt: new Date().toISOString(),
        counts: {
            byGame: computeGlickoGameCounts(glickoByGame),
            site: computeGlickoSiteCounts(glickoSite),
        },
    };

    const topPlayers: UserGameRating[] = [];
    for (const g of ratedGames) {
        const rows = rawList.filter((r) => r.game === g);
        rows.sort(compareBatchRatings);
        const top = rows[0];
        if (top !== undefined) {
            topPlayers.push(top);
        }
    }

    const playerCountsByUid = buildPlayerCountsByUid(rawList);

    console.log("Calculating hours per move");
    const hoursPerResult = computeHoursPerStats(scanState.hoursPerGames, earliest);
    const { winsorizedCount, ...hoursPer } = hoursPerResult;
    console.log(
        `hoursPer winsorization: ${winsorizedCount} of ${hoursPer.n} records omitted by winsorization (p2-p98)`,
    );

    let users: Record<string, unknown>[] | undefined;
    try {
        const data = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "USERS" },
                ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
                ProjectionExpression: "sk, country, #name, publicRivalries",
                ReturnConsumedCapacity: "INDEXES",
            }),
        );
        users = data.Items as Record<string, unknown>[] | undefined;
        if (users === undefined) {
            throw new Error("Found no users?");
        }
    } catch (err) {
        console.log(`An error occurred fetching USERS data: ${err}`);
        throw err;
    }

    const countryCounts = new Map<string, number>();
    const userCountry = new Map<string, string>();
    const userDisplayNames = new Map<string, string>();
    const publicRivalryUsers = new Set<string>();
    for (const user of users) {
        if (typeof user.sk === "string") {
            if (typeof user.name === "string" && user.name.length > 0) {
                userDisplayNames.set(user.sk, user.name);
            }
            if (user.publicRivalries === true) {
                publicRivalryUsers.add(user.sk);
            }
        }
        const alpha2 = typeof user.country === "string"
            ? isoToCountryCode(user.country, "alpha2")
            : undefined;
        if (alpha2 !== undefined) {
            countryCounts.set(alpha2, (countryCounts.get(alpha2) ?? 0) + 1);
            if (typeof user.sk === "string") {
                userCountry.set(user.sk, alpha2);
            }
        }
    }
    const geoStats: GeoStats[] = [];
    for (const [alpha2, count] of countryCounts.entries()) {
        const name = isoToCountryCode(alpha2, "countryName");
        geoStats.push({ code: alpha2, n: count, name: name || alpha2 });
    }
    const activeCountryCounts = new Map<string, number>();
    for (const uid of scanState.recentCompleterIDs) {
        const alpha2 = userCountry.get(uid);
        if (alpha2 !== undefined) {
            activeCountryCounts.set(alpha2, (activeCountryCounts.get(alpha2) ?? 0) + 1);
        }
    }
    const activeGeoStats: GeoStats[] = [];
    for (const [alpha2, count] of activeCountryCounts.entries()) {
        const name = isoToCountryCode(alpha2, "countryName");
        activeGeoStats.push({ code: alpha2, n: count, name: name || alpha2 });
    }
    activeGeoStats.sort((a, b) => b.n - a.n);

    console.log("Calculating rivalries");
    const identifiedRivalryPairs = finalizeRivalryPairs(scanState.rivalryCounts);
    const publicRivalries = publishRivalries(
        identifiedRivalryPairs.filter((p) => p.n >= RIVALRY_PUBLIC_MIN_GAMES),
        publicRivalryUsers,
        userDisplayNames,
    );
    const mvtimes = await loadMvtimes();
    const seasonality = mvtimes.seasonality;
    const activeMovers = alignWeeklyActiveMovers(
        mvtimes.weeklyActiveMovers,
        earliest,
        histograms.maxBucket,
    );
    const rivalriesIdentified: RivalriesFull = {
        generated: new Date().toISOString(),
        minGames: RIVALRY_MIN_GAMES,
        pairs: enrichRivalryPairsWithDisplayNames(identifiedRivalryPairs, userDisplayNames),
    };

    const pastDisplayNames = buildPastDisplayNamesList(
        scanState.pastNamesByUser,
        userDisplayNames,
    );

    const summary: StatSummary = {
        numGames,
        numPlayers,
        oldestRec: scanState.oldest,
        newestRec: scanState.newest,
        timeoutRate,
        abandonedRate,
        playContext,
        pieRates,
        playerCountMix,
        ratings: {
            highest: rawList,
            avg: avgRatings,
            weighted: weightedRatings,
            glickoByGame,
            glickoSite,
            glickoMeta,
            playerCountsByUid,
        },
        topPlayers,
        plays: {
            total: numPlays,
            width: playWidth,
        },
        players: {
            allPlays: playerStats.allPlays,
            eclectic: playerStats.eclectic,
            social: playerStats.social,
            h: playerStats.h,
            hOpp: playerStats.hOpp,
            timeoutStats: histograms.timeoutStats,
        },
        histograms: {
            all: histograms.histAll,
            allPlayers: histograms.histAllPlayers,
            activeMovers,
            playerTimeouts: histograms.histPlayerTimeouts,
            meta: histograms.histMeta,
            players: histograms.histPlayers,
            firstTimers: histograms.firstTimers,
            returningPlayers: histograms.returningPlayers,
            timeouts: histograms.histTimeouts,
            abandoned: histograms.histAbandoned,
        },
        hMeta,
        hoursPer,
        recent: histograms.recent,
        metaStats,
        soloMetaStats,
        soloSeedBoards,
        geoStats,
        activeGeoStats,
        rivalries: publicRivalries,
        seasonality,
        pastDisplayNames,
    };

    const opsCmd = new PutObjectCommand({
        Bucket: OPS_BUCKET,
        Key: RIVALRIES_OPS_KEY,
        Body: JSON.stringify(rivalriesIdentified),
    });
    const opsResponse = await s3.send(opsCmd);
    if (opsResponse.$metadata.httpStatusCode !== 200) {
        console.log(opsResponse);
    }

    const generated = new Date().toISOString();
    const monolithBytes = await putSummaryJson("_summary.json", summary);
    console.log(`Wrote _summary.json (${monolithBytes} bytes)`);

    const tiers = splitStatSummary(summary, generated);
    const siteBytes = await putSummaryJson("_summary-site.json", tiers.site);
    console.log(`Wrote _summary-site.json (${siteBytes} bytes)`);
    const playersBytes = await putSummaryJson("_summary-players.json", tiers.players);
    console.log(`Wrote _summary-players.json (${playersBytes} bytes)`);
    const ratingsBytes = await putSummaryJson("_summary-ratings.json", tiers.ratings);
    console.log(`Wrote _summary-ratings.json (${ratingsBytes} bytes)`);

    console.log("Analysis complete");
};
