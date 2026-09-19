import type { APGameRecord } from "@abstractplay/recranks";
import type { GameNumber } from "types/stats/GameNumber.js";
import type { GameNumList } from "types/stats/GameNumList.js";
import type { MetaPieStats } from "types/stats/MetaPieStats.js";
import type { MetaPlayerCountMix } from "types/stats/MetaPlayerCountMix.js";
import type { UserNumList } from "types/stats/UserNumList.js";
import type { UserNumber } from "types/stats/UserNumber.js";
import {
    accumulateRivalryPair,
    buildPlayerTimeoutHistograms,
    computeReturningPlayersPerWeek,
    computeTimeoutHistogramRates,
    findTimeoutPlayerSeat,
    gameSupportsMultiPlayerCount,
    gameSupportsPie,
    maxOf,
    recordHasAbandoned,
    recordHasTimeout,
    recordMoveSlotCount,
    recordRoundCount,
    recordPlayerTimeout,
    recordWasPied,
    timeoutStatsFromAccumulator,
    hIndexFromCounts,
    metaGameFromRecord,
    type RecordGameIdFallback,
    type HoursPerGameInput,
    type PlayerTimeoutAccumulator,
    type RivalryPairResult,
} from "./summarizeHelpers.js";

export type GameInfoFlags = {
    name: string;
    flags?: string[];
    playercounts: number[];
};

export type SummarizeScanState = {
    numGames: number;
    playerIDs: Set<string>;
    oldest?: string;
    newest?: string;
    casualGames: number;
    eventGames: number;
    playerTimeoutAcc: Map<string, PlayerTimeoutAccumulator>;
    siteEndFailures: number[];
    siteClockTimeouts: number[];
    siteAbandonments: number[];
    metaPlayCount: Map<string, number>;
    metaPlayUsers: Map<string, Set<string>>;
    playerAllPlays: Map<string, number>;
    playerEclecticGames: Map<string, Set<string>>;
    playerSocialOpps: Map<string, Set<string>>;
    playerGameCounts: Map<string, Map<string, number>>;
    playerOppCounts: Map<string, Map<string, number>>;
    rivalryCounts: Map<string, RivalryPairResult>;
    histList: { game: string; bucket: number }[];
    histListPlayers: { user: string; bucket: number }[];
    completedList: { user: string; time: number }[];
    earliestMs?: number;
    pieByGame: Map<string, { n: number; pied: number }>;
    playerCountMixByGame: Map<string, Map<string, number>>;
    hoursPerGames: HoursPerGameInput[];
    recentCompleterIDs: Set<string>;
    pastNamesByUser: Map<string, Set<string>>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_GEO_DAYS = 30;

export function createSummarizeScanState(): SummarizeScanState {
    return {
        numGames: 0,
        playerIDs: new Set(),
        casualGames: 0,
        eventGames: 0,
        playerTimeoutAcc: new Map(),
        siteEndFailures: [],
        siteClockTimeouts: [],
        siteAbandonments: [],
        metaPlayCount: new Map(),
        metaPlayUsers: new Map(),
        playerAllPlays: new Map(),
        playerEclecticGames: new Map(),
        playerSocialOpps: new Map(),
        playerGameCounts: new Map(),
        playerOppCounts: new Map(),
        rivalryCounts: new Map(),
        histList: [],
        histListPlayers: [],
        completedList: [],
        pieByGame: new Map(),
        playerCountMixByGame: new Map(),
        hoursPerGames: [],
        recentCompleterIDs: new Set(),
        pastNamesByUser: new Map(),
    };
}

export function buildPastDisplayNamesList(
    pastNamesByUser: Map<string, Set<string>>,
    currentDisplayNames: Map<string, string>,
): { user: string; names: string[] }[] {
    const result: { user: string; names: string[] }[] = [];
    for (const [user, names] of pastNamesByUser) {
        const current = currentDisplayNames.get(user)?.trim();
        const filtered = [...names]
            .map((n) => n.trim())
            .filter((n) => n.length > 0 && n !== current);
        const unique = [...new Set(filtered)].sort((a, b) => a.localeCompare(b));
        if (unique.length > 0) {
            result.push({ user, names: unique });
        }
    }
    result.sort((a, b) => a.user.localeCompare(b.user));
    return result;
}

function incrementMapCount(map: Map<string, number>, key: string, delta = 1): void {
    map.set(key, (map.get(key) ?? 0) + delta);
}

function nestedIncrement(
    outer: Map<string, Map<string, number>>,
    outerKey: string,
    innerKey: string,
): void {
    let inner = outer.get(outerKey);
    if (inner === undefined) {
        inner = new Map();
        outer.set(outerKey, inner);
    }
    inner.set(innerKey, (inner.get(innerKey) ?? 0) + 1);
}

export function scanRecord(
    state: SummarizeScanState,
    rec: APGameRecord,
    gameInfoByUid: Map<string, GameInfoFlags>,
    fallback?: RecordGameIdFallback,
): void {
    state.numGames++;
    const metaUid = metaGameFromRecord(rec, fallback);
    const dateEnd = rec.header["date-end"];
    const completedMs = new Date(dateEnd).getTime();

    if (state.oldest === undefined || dateEnd < state.oldest) {
        state.oldest = dateEnd;
    }
    if (state.newest === undefined || dateEnd > state.newest) {
        state.newest = dateEnd;
    }
    if (state.earliestMs === undefined || completedMs < state.earliestMs) {
        state.earliestMs = completedMs;
    }

    incrementMapCount(state.metaPlayCount, metaUid);
    let metaUsers = state.metaPlayUsers.get(metaUid);
    if (metaUsers === undefined) {
        metaUsers = new Set();
        state.metaPlayUsers.set(metaUid, metaUsers);
    }

    const playerIdsInRec: string[] = [];
    for (const p of rec.header.players) {
        if (p.userid !== undefined && typeof p.name === "string") {
            const embeddedName = p.name.trim();
            if (embeddedName.length > 0) {
                let nameSet = state.pastNamesByUser.get(p.userid);
                if (nameSet === undefined) {
                    nameSet = new Set();
                    state.pastNamesByUser.set(p.userid, nameSet);
                }
                nameSet.add(embeddedName);
            }
        }
        if (p.userid === undefined) {
            continue;
        }
        const user = p.userid;
        state.playerIDs.add(user);
        playerIdsInRec.push(user);
        metaUsers.add(user);
        incrementMapCount(state.playerAllPlays, user);

        let eclectic = state.playerEclecticGames.get(user);
        if (eclectic === undefined) {
            eclectic = new Set();
            state.playerEclecticGames.set(user, eclectic);
        }
        eclectic.add(metaUid);
        nestedIncrement(state.playerGameCounts, user, metaUid);
    }

    for (const user of playerIdsInRec) {
        let opps = state.playerSocialOpps.get(user);
        if (opps === undefined) {
            opps = new Set();
            state.playerSocialOpps.set(user, opps);
        }
        for (const other of playerIdsInRec) {
            if (other !== user) {
                opps.add(other);
                nestedIncrement(state.playerOppCounts, user, other);
            }
        }
    }

    if (rec.header.event !== undefined && rec.header.event !== "") {
        state.eventGames++;
    } else {
        state.casualGames++;
    }

    if (recordHasAbandoned(rec.moves)) {
        state.siteEndFailures.push(completedMs);
        state.siteAbandonments.push(completedMs);
    } else if (recordHasTimeout(rec.moves)) {
        state.siteEndFailures.push(completedMs);
        state.siteClockTimeouts.push(completedMs);
        const seatIdx = findTimeoutPlayerSeat(rec.moves, rec.header.players.length);
        if (seatIdx !== undefined) {
            const p = rec.header.players[seatIdx];
            if (p.userid !== undefined) {
                recordPlayerTimeout(state.playerTimeoutAcc, p.userid, completedMs);
            }
        }
    }

    accumulateRivalryPair(state.rivalryCounts, rec);

    const found = gameInfoByUid.get(metaUid);
    if (found !== undefined) {
        if (gameSupportsPie(found.flags)) {
            const acc = state.pieByGame.get(metaUid) ?? { n: 0, pied: 0 };
            acc.n++;
            if (recordWasPied(rec.header)) {
                acc.pied++;
            }
            state.pieByGame.set(metaUid, acc);
        }
        if (gameSupportsMultiPlayerCount(found.playercounts)) {
            const key = String(rec.header.players.length);
            let byCount = state.playerCountMixByGame.get(metaUid);
            if (byCount === undefined) {
                byCount = new Map();
                state.playerCountMixByGame.set(metaUid, byCount);
            }
            byCount.set(key, (byCount.get(key) ?? 0) + 1);
        }
    }

    const activeGeoCutoffMs = Date.now() - ACTIVE_GEO_DAYS * MS_PER_DAY;
    if (completedMs >= activeGeoCutoffMs) {
        for (const user of playerIdsInRec) {
            state.recentCompleterIDs.add(user);
        }
    }

    const earliest = state.earliestMs!;
    const daysAgo = (completedMs - earliest) / MS_PER_DAY;
    const bucket = Math.floor(daysAgo / 7);
    state.histList.push({ game: metaUid, bucket });
    for (const user of playerIdsInRec) {
        state.histListPlayers.push({ user, bucket });
        state.completedList.push({ user, time: completedMs });
    }

    if (
        !recordHasTimeout(rec.moves) &&
        !recordHasAbandoned(rec.moves) &&
        recordRoundCount(rec) >= 2 &&
        rec.header["date-start"] !== undefined
    ) {
        const started = new Date(rec.header["date-start"]).getTime();
        const moveSlots = recordMoveSlotCount(rec);
        if (moveSlots > 0) {
            state.hoursPerGames.push({ dateStartMs: started, dateEndMs: completedMs, moveSlots });
        }
    }
}

export function buildPlayStats(state: SummarizeScanState): {
    numPlays: GameNumber[];
    playWidth: GameNumber[];
} {
    const numPlays: GameNumber[] = [];
    const playWidth: GameNumber[] = [];
    for (const [game, count] of state.metaPlayCount.entries()) {
        numPlays.push({ game, value: count });
        playWidth.push({ game, value: state.metaPlayUsers.get(game)?.size ?? 0 });
    }
    return { numPlays, playWidth };
}

export function buildPlayerStats(state: SummarizeScanState): {
    allPlays: UserNumber[];
    eclectic: UserNumber[];
    social: UserNumber[];
    h: UserNumber[];
    hOpp: UserNumber[];
} {
    const allPlays: UserNumber[] = [];
    const eclectic: UserNumber[] = [];
    const social: UserNumber[] = [];
    const h: UserNumber[] = [];
    const hOpp: UserNumber[] = [];

    for (const [user, count] of state.playerAllPlays.entries()) {
        allPlays.push({ user, value: count });
        eclectic.push({ user, value: state.playerEclecticGames.get(user)?.size ?? 0 });
        social.push({ user, value: state.playerSocialOpps.get(user)?.size ?? 0 });

        const gameCounts = state.playerGameCounts.get(user);
        h.push({
            user,
            value: gameCounts === undefined ? 0 : hIndexFromCounts(gameCounts.values()),
        });

        const oppCounts = state.playerOppCounts.get(user);
        hOpp.push({
            user,
            value: oppCounts === undefined ? 0 : hIndexFromCounts(oppCounts.values()),
        });
    }

    return { allPlays, eclectic, social, h, hOpp };
}

export function buildPieRates(state: SummarizeScanState): MetaPieStats[] {
    const pieRates: MetaPieStats[] = [];
    for (const [game, acc] of state.pieByGame.entries()) {
        pieRates.push({
            game,
            n: acc.n,
            pied: acc.pied,
            rate: acc.n > 0 ? acc.pied / acc.n : 0,
        });
    }
    pieRates.sort((a, b) => a.game.localeCompare(b.game));
    return pieRates;
}

export function buildPlayerCountMix(state: SummarizeScanState): MetaPlayerCountMix[] {
    const mix: MetaPlayerCountMix[] = [];
    for (const [game, byCount] of state.playerCountMixByGame.entries()) {
        const counts: { [playerCount: string]: number } = {};
        for (const [key, value] of byCount.entries()) {
            counts[key] = value;
        }
        mix.push({ game, byCount: counts });
    }
    mix.sort((a, b) => a.game.localeCompare(b.game));
    return mix;
}

export function buildSiteHistograms(state: SummarizeScanState): {
    histAll: number[];
    histAllPlayers: number[];
    histTimeouts: number[];
    histAbandoned: number[];
    histMeta: GameNumList[];
    histPlayers: UserNumList[];
    firstTimers: number[];
    returningPlayers: number[];
    recent: GameNumber[];
    maxBucket: number;
    histPlayerTimeouts: UserNumList[];
    timeoutStats: ReturnType<typeof timeoutStatsFromAccumulator>;
} {
    const earliest = state.earliestMs ?? 0;
    let maxBucket = maxOf(state.histList.map((x) => x.bucket));

    const histAll: number[] = [];
    const histAllPlayers: number[] = [];
    for (let i = 0; i <= maxBucket; i++) {
        histAll.push(state.histList.filter((x) => x.bucket === i).length);
        const users = new Set<string>();
        for (const rec of state.histListPlayers.filter((x) => x.bucket === i)) {
            users.add(rec.user);
        }
        histAllPlayers.push(users.size);
    }

    const histTimeoutBuckets: number[] = [];
    for (const t of state.siteClockTimeouts) {
        const daysAgo = (t - earliest) / MS_PER_DAY;
        histTimeoutBuckets.push(Math.floor(daysAgo / 7));
    }
    const histTimeoutCounts: number[] = [];
    for (let i = 0; i <= maxOf(histTimeoutBuckets); i++) {
        histTimeoutCounts.push(histTimeoutBuckets.filter((x) => x === i).length);
    }
    const histTimeouts = computeTimeoutHistogramRates(histTimeoutCounts, histAll);

    const histAbandonedBuckets: number[] = [];
    for (const t of state.siteAbandonments) {
        const daysAgo = (t - earliest) / MS_PER_DAY;
        histAbandonedBuckets.push(Math.floor(daysAgo / 7));
    }
    const histAbandonedCounts: number[] = [];
    for (let i = 0; i <= maxOf(histAbandonedBuckets); i++) {
        histAbandonedCounts.push(histAbandonedBuckets.filter((x) => x === i).length);
    }
    const histAbandoned = computeTimeoutHistogramRates(histAbandonedCounts, histAll);

    const histMeta: GameNumList[] = [];
    const recent: GameNumber[] = [];
    const metaNames = new Set(state.histList.map((x) => x.game));
    for (const meta of metaNames) {
        const subset = state.histList.filter((x) => x.game === meta);
        const metaMax = maxOf(subset.map((x) => x.bucket));
        const lst: number[] = [];
        for (let i = 0; i <= metaMax; i++) {
            lst.push(subset.filter((x) => x.bucket === i).length);
        }
        histMeta.push({ game: meta, value: [...lst] });
        const slice = lst.slice(-4);
        recent.push({ game: meta, value: slice.reduce((prev, curr) => prev + curr, 0) });
    }

    const histPlayers: UserNumList[] = [];
    const userIds = new Set(state.histListPlayers.map((x) => x.user));
    for (const userid of userIds) {
        const subset = state.histListPlayers.filter((x) => x.user === userid);
        const userMax = maxOf(subset.map((x) => x.bucket));
        const lst: number[] = [];
        for (let i = 0; i <= userMax; i++) {
            lst.push(subset.filter((x) => x.bucket === i).length);
        }
        histPlayers.push({ user: userid, value: [...lst] });
    }

    const timeoutStats = timeoutStatsFromAccumulator(state.playerTimeoutAcc);
    const histPlayerTimeouts = buildPlayerTimeoutHistograms(
        state.playerTimeoutAcc,
        userIds,
        earliest,
    );

    const buckets: number[] = [];
    for (const userid of userIds) {
        const times = state.completedList.filter((x) => x.user === userid).map((x) => x.time);
        const localEarliest = Math.min(...times);
        const daysAgo = (localEarliest - earliest) / MS_PER_DAY;
        buckets.push(Math.floor(daysAgo / 7));
    }
    const firstTimers: number[] = [];
    maxBucket = maxOf(buckets);
    for (let i = 0; i <= maxBucket; i++) {
        firstTimers.push(buckets.filter((x) => x === i).length);
    }
    const returningPlayers = computeReturningPlayersPerWeek(state.completedList, earliest, maxBucket);

    return {
        histAll,
        histAllPlayers,
        histTimeouts,
        histAbandoned,
        histMeta,
        histPlayers,
        firstTimers,
        returningPlayers,
        recent,
        maxBucket,
        histPlayerTimeouts,
        timeoutStats,
    };
}
