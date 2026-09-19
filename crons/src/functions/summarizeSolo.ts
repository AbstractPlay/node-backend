import type { APGameRecord } from "@abstractplay/recranks";
import { batchRatingGameLabel } from "../lib/batchRatings.js";
import type {
    ScoreDirection,
    SoloMetaStats,
    SoloOutcomeType,
    SoloSeedBoard,
    SoloSeedBoardRow,
} from "types/stats/SoloStats.js";
import {
    medianOf,
    metaGameFromRecord,
    percentileOf,
    recordRoundCount,
    variantUidsFromRecord,
    type RecordGameIdFallback,
} from "./summarizeHelpers.js";

type SoloPlayer = {
    score?: number;
    grade?: string;
    passed?: boolean;
    result?: number;
    userid?: string;
    name: string;
};

type SoloHeader = APGameRecord["header"] & {
    "outcome-type"?: SoloOutcomeType;
    "score-direction"?: ScoreDirection;
    "challenge-seed"?: string;
};

export type SoloVariantBucket = {
    metaUid: string;
    variants: string[];
    records: APGameRecord[];
};

export type SoloSeedBucket = {
    variantKey: string;
    metaUid: string;
    variants: string[];
    seed: string;
    records: APGameRecord[];
};

export type SoloSummarizeState = {
    byVariant: Map<string, SoloVariantBucket>;
    bySeed: Map<string, SoloSeedBucket>;
};

const soloHeader = (rec: APGameRecord): SoloHeader => rec.header as SoloHeader;

export const isSoloRecord = (rec: APGameRecord): boolean => rec.header.players.length === 1;

const playerScore = (rec: APGameRecord): number => {
    const player = rec.header.players[0] as SoloPlayer;
    return player.score ?? player.result ?? 0;
};

const scoreDirection = (rec: APGameRecord): ScoreDirection =>
    soloHeader(rec)["score-direction"] ?? "higher";

/** True when `candidate` ranks better than `incumbent` for this bucket's score direction. */
export const soloAttemptIsBetter = (candidate: APGameRecord, incumbent: APGameRecord): boolean => {
    const dir = scoreDirection(candidate);
    const next = playerScore(candidate);
    const prev = playerScore(incumbent);
    if (dir === "higher") {
        if (next !== prev) {
            return next > prev;
        }
    } else if (next !== prev) {
        return next < prev;
    }
    const nextMoves = recordRoundCount(candidate);
    const prevMoves = recordRoundCount(incumbent);
    if (nextMoves !== prevMoves) {
        return nextMoves < prevMoves;
    }
    return candidate.header["date-end"] < incumbent.header["date-end"];
};

export function createSoloSummarizeState(): SoloSummarizeState {
    return {
        byVariant: new Map(),
        bySeed: new Map(),
    };
}

export function accumulateSoloRecord(
    state: SoloSummarizeState,
    rec: APGameRecord,
    fallback?: RecordGameIdFallback,
): void {
    if (!isSoloRecord(rec)) {
        return;
    }
    const player = rec.header.players[0];
    if (player.userid === undefined || player.userid === "") {
        return;
    }

    const metaUid = metaGameFromRecord(rec, fallback);
    const variants = variantUidsFromRecord(rec, fallback);
    const variantKey = batchRatingGameLabel(metaUid, variants);

    let variantBucket = state.byVariant.get(variantKey);
    if (variantBucket === undefined) {
        variantBucket = { metaUid, variants, records: [] };
        state.byVariant.set(variantKey, variantBucket);
    }
    variantBucket.records.push(rec);

    const seed = soloHeader(rec)["challenge-seed"];
    if (typeof seed === "string" && seed.length > 0) {
        const seedKey = `${variantKey}\t${seed}`;
        let seedBucket = state.bySeed.get(seedKey);
        if (seedBucket === undefined) {
            seedBucket = { variantKey, metaUid, variants, seed, records: [] };
            state.bySeed.set(seedKey, seedBucket);
        }
        seedBucket.records.push(rec);
    }
}

type BestPerUser = Map<string, { best: APGameRecord; attempts: number }>;

const bestPerUser = (records: APGameRecord[]): BestPerUser => {
    const byUser: BestPerUser = new Map();
    for (const rec of records) {
        const userid = rec.header.players[0].userid;
        if (userid === undefined || userid === "") {
            continue;
        }
        const existing = byUser.get(userid);
        if (existing === undefined) {
            byUser.set(userid, { best: rec, attempts: 1 });
        } else {
            existing.attempts += 1;
            if (soloAttemptIsBetter(rec, existing.best)) {
                existing.best = rec;
            }
        }
    }
    return byUser;
};

const outcomeTypeCounts = (records: APGameRecord[]): Partial<Record<SoloOutcomeType, number>> => {
    const counts: Partial<Record<SoloOutcomeType, number>> = {};
    for (const rec of records) {
        const outcomeType = soloHeader(rec)["outcome-type"];
        if (outcomeType === undefined) {
            continue;
        }
        counts[outcomeType] = (counts[outcomeType] ?? 0) + 1;
    }
    return counts;
};

const passRateAllAttempts = (records: APGameRecord[]): number | undefined => {
    const binary = records.filter((rec) => soloHeader(rec)["outcome-type"] === "binary");
    if (binary.length === 0) {
        return undefined;
    }
    const passed = binary.filter((rec) => (rec.header.players[0] as SoloPlayer).passed === true);
    return passed.length / binary.length;
};

const passRateBestPerUser = (byUser: BestPerUser): number | undefined => {
    const binary = [...byUser.values()].filter(
        (entry) => soloHeader(entry.best)["outcome-type"] === "binary",
    );
    if (binary.length === 0) {
        return undefined;
    }
    const passed = binary.filter((entry) => (entry.best.header.players[0] as SoloPlayer).passed === true);
    return passed.length / binary.length;
};

const gradeHistogramBestPerUser = (byUser: BestPerUser): Record<string, number> | undefined => {
    const grades: Record<string, number> = {};
    let hasGrade = false;
    for (const entry of byUser.values()) {
        const grade = (entry.best.header.players[0] as SoloPlayer).grade;
        if (grade === undefined || grade === "") {
            continue;
        }
        hasGrade = true;
        grades[grade] = (grades[grade] ?? 0) + 1;
    }
    return hasGrade ? grades : undefined;
};

const buildSeedBoardRows = (byUser: BestPerUser, sample: APGameRecord): SoloSeedBoardRow[] => {
    const dir = scoreDirection(sample);
    const rows: SoloSeedBoardRow[] = [];
    for (const [userid, entry] of byUser.entries()) {
        const player = entry.best.header.players[0] as SoloPlayer & (typeof entry.best.header.players)[0];
        rows.push({
            userid,
            name: player.name,
            score: playerScore(entry.best),
            grade: player.grade,
            passed: player.passed,
            dateEnd: entry.best.header["date-end"],
            attempts: entry.attempts,
        });
    }
    rows.sort((a, b) => {
        if (dir === "higher") {
            if (a.score !== b.score) {
                return b.score - a.score;
            }
        } else if (a.score !== b.score) {
            return a.score - b.score;
        }
        return a.dateEnd.localeCompare(b.dateEnd);
    });
    return rows;
};

const scoreStats = (records: APGameRecord[], byUser: BestPerUser) => {
    const allScores = records.map(playerScore);
    const bestScores = [...byUser.values()].map((entry) => playerScore(entry.best));
    return {
        scoreMedianAllAttempts: medianOf(allScores),
        scoreMedianBestPerUser: medianOf(bestScores),
        scoreP90BestPerUser: percentileOf(bestScores, 90),
    };
};

export function buildSoloMetaStats(state: SoloSummarizeState): Record<string, SoloMetaStats> {
    const result: Record<string, SoloMetaStats> = {};
    for (const [variantKey, bucket] of state.byVariant.entries()) {
        const { metaUid, variants, records } = bucket;
        if (records.length === 0) {
            continue;
        }
        const byUser = bestPerUser(records);
        const uniquePlayers = byUser.size;
        const attempts = records.length;
        const scores = scoreStats(records, byUser);
        const moveCounts = records.map(recordRoundCount);
        result[variantKey] = {
            game: variantKey,
            metaUid,
            variants,
            attempts,
            uniquePlayers,
            repeatAttemptRate: attempts > 0 ? (attempts - uniquePlayers) / attempts : 0,
            outcomeTypes: outcomeTypeCounts(records),
            ...scores,
            passRateAllAttempts: passRateAllAttempts(records),
            passRateBestPerUser: passRateBestPerUser(byUser),
            gradeHistogramBestPerUser: gradeHistogramBestPerUser(byUser),
            moveCountMedian: medianOf(moveCounts),
        };
    }
    return result;
}

export function buildSoloSeedBoards(state: SoloSummarizeState): SoloSeedBoard[] {
    const boards: SoloSeedBoard[] = [];
    for (const bucket of state.bySeed.values()) {
        const { variantKey, metaUid, variants, seed, records } = bucket;
        if (records.length === 0) {
            continue;
        }
        const byUser = bestPerUser(records);
        const sample = records[0]!;
        const scores = scoreStats(records, byUser);
        boards.push({
            game: variantKey,
            metaUid,
            variants,
            challengeSeed: seed,
            scoreDirection: scoreDirection(sample),
            outcomeType: soloHeader(sample)["outcome-type"],
            attempts: records.length,
            uniquePlayers: byUser.size,
            scoreMedianAllAttempts: scores.scoreMedianAllAttempts,
            scoreMedianBestPerUser: scores.scoreMedianBestPerUser,
            rows: buildSeedBoardRows(byUser, sample),
        });
    }
    boards.sort((a, b) => {
        const byGame = a.game.localeCompare(b.game);
        if (byGame !== 0) {
            return byGame;
        }
        return a.challengeSeed.localeCompare(b.challengeSeed);
    });
    return boards;
}
