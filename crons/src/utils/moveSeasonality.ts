export const MOVE_SEASONALITY_WINDOW_DAYS = 365;

export type MoveActivityInput = {
    player: string;
    time: number;
};

export type MoveSeasonalityResult = {
    movesByDow: number[];
    playersByDow: number[];
    movesByHour: number[];
    windowDays: number;
};

export type WeeklyActiveMovers = {
    /** Week-bucket origin (ms); matches `oldestRec` epoch used in summarize histograms. */
    originMs: number;
    /** Distinct players with ≥1 move per bucket; index 0 = first seven-day period from origin. */
    byWeek: number[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Bin move timestamps by UTC day-of-week and hour (aggregated across the window). */
export function computeMoveSeasonality(
    moves: MoveActivityInput[],
    windowDays: number = MOVE_SEASONALITY_WINDOW_DAYS,
): MoveSeasonalityResult {
    const movesByDow = Array.from({ length: 7 }, () => 0);
    const movesByHour = Array.from({ length: 24 }, () => 0);
    const playersByDowSets: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());

    for (const { player, time } of moves) {
        const d = new Date(time);
        const dow = d.getUTCDay();
        const hour = d.getUTCHours();
        movesByDow[dow]++;
        movesByHour[hour]++;
        playersByDowSets[dow].add(player);
    }

    return {
        movesByDow,
        playersByDow: playersByDowSets.map((s) => s.size),
        movesByHour,
        windowDays,
    };
}

export function computeWeeklyActiveMovers(
    moves: MoveActivityInput[],
    originMs: number,
): WeeklyActiveMovers {
    const bucketPlayers = new Map<number, Set<string>>();
    let maxBucket = -1;
    for (const { player, time } of moves) {
        if (time < originMs) {
            continue;
        }
        const bucket = Math.floor((time - originMs) / MS_PER_WEEK);
        if (bucket < 0) {
            continue;
        }
        maxBucket = Math.max(maxBucket, bucket);
        let set = bucketPlayers.get(bucket);
        if (set === undefined) {
            set = new Set<string>();
            bucketPlayers.set(bucket, set);
        }
        set.add(player);
    }
    const byWeek: number[] = [];
    for (let i = 0; i <= maxBucket; i++) {
        byWeek.push(bucketPlayers.get(i)?.size ?? 0);
    }
    return { originMs, byWeek };
}

/** Align move-time weekly counts to summarize histogram buckets (same origin and length). */
export function alignWeeklyActiveMovers(
    movers: WeeklyActiveMovers | undefined,
    originMs: number,
    maxBucket: number,
): number[] {
    const aligned = Array.from({ length: maxBucket + 1 }, () => 0);
    if (movers === undefined || movers.byWeek.length === 0) {
        return aligned;
    }
    if (movers.originMs === originMs) {
        for (let i = 0; i <= maxBucket && i < movers.byWeek.length; i++) {
            aligned[i] = movers.byWeek[i] ?? 0;
        }
        return aligned;
    }
    const offset = Math.floor((movers.originMs - originMs) / MS_PER_WEEK);
    for (let i = 0; i < movers.byWeek.length; i++) {
        const target = i + offset;
        if (target >= 0 && target <= maxBucket) {
            aligned[target] = movers.byWeek[i] ?? 0;
        }
    }
    return aligned;
}
