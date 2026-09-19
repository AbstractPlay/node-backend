import type { GlickoMeta } from "types/stats/GlickoStats.js";
import type { StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import { RATINGS_NOTIFICATION_SNAPSHOT_KEY } from "../constants/recordsBucket.js";
import { GLICKO_PRIOR_RATING_LOW, defaultGlickoPrior, parseBatchRatingGameLabel } from "./batchRatings.js";
import {
    wantsInAppNotification,
    type InAppNotificationUserSettings,
} from "./inAppNotificationPrefs.js";

export const MIN_RATING_DELTA = 5;
export const NOTIFICATION_INITIAL_TTL_DAYS = 180;
/** Bump when rating methodology changes so the next notification run re-seeds without notifying. */
export const RATINGS_NOTIFICATION_BASELINE = 2;
const SEC_PER_DAY = 86_400;
const NOTIFICATION_PK_PREFIX = "NOTIFICATION#";

export type RatingNotificationSnapshotEntry = {
    ratingLow: number;
    rd: number;
    provisional: boolean;
    n: number;
};

export type RatingNotificationSnapshot = {
    generatedAt: string;
    summaryGeneratedAt: string;
    baseline: number;
    entries: Record<string, RatingNotificationSnapshotEntry>;
};

export type RatingChangeCandidate = {
    userId: string;
    gameLabel: string;
    metaGameUid: string;
    variants: string[];
    oldRating: number;
    newRating: number;
    oldRd: number;
    newRd: number;
    oldProvisional: boolean;
    newProvisional: boolean;
    delta: number;
};

type RatingChangeDiffRow = RatingChangeCandidate & {
    oldN: number;
    newN: number;
};

export type RatingChangeFilterStats = {
    skippedNoActivity: number;
    skippedBelowThreshold: number;
    skippedProvisional: number;
    skippedBot: number;
    skippedInAppPrefs: number;
};

export type RatingChangeNotificationItem = {
    pk: string;
    sk: string;
    body: {
        type: "ratingChange";
        metaGame: string;
        variants: string[];
        gameId: string;
        oldRating: number;
        newRating: number;
        oldRd: number;
        newRd: number;
        oldProvisional: boolean;
        newProvisional: boolean;
        delta: number;
    };
    expiresAt: number;
};

export type RatingChangeConstants = {
    minRatingDelta: number;
    minGamesProvisional: number;
};

function snapshotEntryKey(userId: string, gameLabel: string): string {
    return `${userId}|${gameLabel}`;
}

function roundRatingLow(ratingLow: number): number {
    return Math.round(ratingLow);
}

function roundRd(rd: number): number {
    return Math.round(rd);
}

const GLICKO_PRIOR = defaultGlickoPrior();

function uniqueSortKey(now = Date.now()): string {
    return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

function notificationExpiresAt(now = Date.now()): number {
    return Math.floor(now / 1000) + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY;
}

export function ratingChangeConstantsFromEnv(
    glickoMeta: GlickoMeta,
): RatingChangeConstants {
    const envDelta = process.env.MIN_RATING_DELTA;
    const minRatingDelta = envDelta !== undefined && envDelta !== ""
        ? Number(envDelta)
        : MIN_RATING_DELTA;
    return {
        minRatingDelta: Number.isFinite(minRatingDelta) ? minRatingDelta : MIN_RATING_DELTA,
        minGamesProvisional: glickoMeta.minGamesProvisional,
    };
}

export function buildRatingChangeSnapshot(
    summary: StatSummaryRatings,
    summaryGeneratedAt: string,
    generatedAt = new Date().toISOString(),
): RatingNotificationSnapshot {
    const entries: Record<string, RatingNotificationSnapshotEntry> = {};
    for (const row of summary.ratings.highest) {
        const glicko = row.glicko;
        if (glicko === undefined) {
            continue;
        }
        entries[snapshotEntryKey(row.user, row.game)] = {
            ratingLow: glicko.ratingLow,
            rd: glicko.rd,
            provisional: glicko.provisional,
            n: glicko.n,
        };
    }
    return {
        generatedAt,
        summaryGeneratedAt,
        baseline: RATINGS_NOTIFICATION_BASELINE,
        entries,
    };
}

export function diffRatingChanges(
    prev: RatingNotificationSnapshot,
    highest: UserGameRating[],
): RatingChangeDiffRow[] {
    const rows: RatingChangeDiffRow[] = [];
    for (const row of highest) {
        const glicko = row.glicko;
        if (glicko === undefined) {
            continue;
        }
        const key = snapshotEntryKey(row.user, row.game);
        const oldEntry = prev.entries[key];
        const oldRatingLow = oldEntry?.ratingLow ?? GLICKO_PRIOR_RATING_LOW;
        const oldRd = oldEntry?.rd ?? GLICKO_PRIOR.rd;
        const oldProvisional = oldEntry?.provisional ?? GLICKO_PRIOR.provisional;
        const oldN = oldEntry?.n ?? 0;
        const newRating = roundRatingLow(glicko.ratingLow);
        const oldRating = roundRatingLow(oldRatingLow);
        const newRd = roundRd(glicko.rd);
        const oldRdRounded = roundRd(oldRd);
        const { metaUid, variantUids } = parseBatchRatingGameLabel(row.game);
        rows.push({
            userId: row.user,
            gameLabel: row.game,
            metaGameUid: metaUid,
            variants: variantUids,
            oldRating,
            newRating,
            oldRd: oldRdRounded,
            newRd,
            oldProvisional,
            newProvisional: glicko.provisional,
            delta: newRating - oldRating,
            oldN,
            newN: glicko.n,
        });
    }
    return rows;
}

export function filterCandidates(
    diffRows: RatingChangeDiffRow[],
    botIds: Set<string>,
    constants: RatingChangeConstants,
): { candidates: RatingChangeCandidate[]; stats: RatingChangeFilterStats } {
    const stats: RatingChangeFilterStats = {
        skippedNoActivity: 0,
        skippedBelowThreshold: 0,
        skippedProvisional: 0,
        skippedBot: 0,
        skippedInAppPrefs: 0,
    };
    const filtered: RatingChangeCandidate[] = [];

    for (const row of diffRows) {
        if (botIds.has(row.userId)) {
            stats.skippedBot += 1;
            continue;
        }
        if (row.newN <= row.oldN) {
            stats.skippedNoActivity += 1;
            continue;
        }
        if (row.newProvisional && row.newN < constants.minGamesProvisional) {
            stats.skippedProvisional += 1;
            continue;
        }
        if (Math.abs(row.delta) < constants.minRatingDelta) {
            stats.skippedBelowThreshold += 1;
            continue;
        }
        filtered.push({
            userId: row.userId,
            gameLabel: row.gameLabel,
            metaGameUid: row.metaGameUid,
            variants: row.variants,
            oldRating: row.oldRating,
            newRating: row.newRating,
            oldRd: row.oldRd,
            newRd: row.newRd,
            oldProvisional: row.oldProvisional,
            newProvisional: row.newProvisional,
            delta: row.delta,
        });
    }

    return { candidates: filtered, stats };
}

export function filterCandidatesByInAppPrefs(
    candidates: RatingChangeCandidate[],
    userSettings: ReadonlyMap<string, InAppNotificationUserSettings | undefined>,
): { candidates: RatingChangeCandidate[]; skippedInAppPrefs: number } {
    const filtered: RatingChangeCandidate[] = [];
    let skippedInAppPrefs = 0;

    for (const candidate of candidates) {
        const settings = userSettings.get(candidate.userId);
        if (!wantsInAppNotification(settings, "ratingChange")) {
            skippedInAppPrefs += 1;
            continue;
        }
        filtered.push(candidate);
    }

    return { candidates: filtered, skippedInAppPrefs };
}

export function toNotificationItems(
    candidates: RatingChangeCandidate[],
    now = Date.now(),
): RatingChangeNotificationItem[] {
    return candidates.map((candidate, index) => {
        const itemNow = now + index;
        return {
            pk: `${NOTIFICATION_PK_PREFIX}${candidate.userId}`,
            sk: uniqueSortKey(itemNow),
            body: {
                type: "ratingChange",
                metaGame: candidate.metaGameUid,
                variants: candidate.variants,
                gameId: "",
                oldRating: candidate.oldRating,
                newRating: candidate.newRating,
                oldRd: candidate.oldRd,
                newRd: candidate.newRd,
                oldProvisional: candidate.oldProvisional,
                newProvisional: candidate.newProvisional,
                delta: candidate.delta,
            },
            expiresAt: notificationExpiresAt(itemNow),
        };
    });
}

export { RATINGS_NOTIFICATION_SNAPSHOT_KEY };
