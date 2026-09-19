/** Anonymized recommendation impression analytics (funnel / CTR rollups). */

export const RECOMMENDS_PK_PREFIX = "RECOMMENDS#";
export const MIN_RATE_DENOMINATOR = 20;
export const TOP_META_GAMES = 30;
export const MAX_POSITION = 7;
export const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;
export const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAILY_RETENTION_DAYS = 90;

/** Reference weights from front `gameRecommendations.js` — for agent review only. */
export const HYBRID_WEIGHTS_REFERENCE = {
    content: 0.45,
    cooccur: 0.35,
    popularity: 0.15,
    recency: 0.1,
} as const;

export type RecEventType = "rec_show" | "rec_click" | "rec_challenge";

export type RawDdbItem = {
    pk?: string;
    sk?: string;
    event?: string;
    batchId?: string;
    surface?: string;
    tier?: string;
    metaGame?: string;
    position?: number;
    reasonType?: string;
    gameIds?: string[];
    reasons?: string[];
};

export type NormalizedRecEvent = {
    eventTimeMs: number;
    event: RecEventType;
    batchId: string;
    surface: string;
    tier: string;
    metaGame?: string;
    position?: number;
    reasonType?: string;
    gameIds?: string[];
    reasons?: string[];
};

export type FunnelCounts = {
    shows: number;
    clicks: number;
    challenges: number;
};

export type FunnelRates = {
    ctr: number;
    challengeRate: number;
    endToEndRate: number;
};

export type DimensionFunnel = FunnelCounts & {
    ctr?: number;
    challengeRate?: number;
    endToEndRate?: number;
};

export type ReasonTypeCounts = {
    clicks: number;
    showReasons: number;
};

export type MetaGameCount = {
    metaGame: string;
    count: number;
};

export type DataQuality = {
    eventsParsed: number;
    eventsSkipped: number;
    parseErrors: number;
    orphanClicks: number;
    duplicateEventsPerBatch: number;
    eventsProcessed: number;
};

export type AnalyticsSlice = {
    window?: { start: string; end: string };
    generatedAt?: string;
    totals: FunnelCounts;
    rates: FunnelRates;
    bySurface: Record<string, DimensionFunnel>;
    byTier: Record<string, DimensionFunnel>;
    byReasonType: Record<string, ReasonTypeCounts>;
    topClickedMetaGames: MetaGameCount[];
    topChallengedMetaGames: MetaGameCount[];
    positionHistogram: Record<string, number>;
    dataQuality: DataQuality;
};

export type AnalyticsSummary = AnalyticsSlice & {
    rolling7d: AnalyticsSlice;
    rolling30d: AnalyticsSlice;
};

export type AnalyticsState = {
    lastRunAt: string;
    lastSkWatermarkMs: number;
    /** `pk#sk` keys already counted in daily rollups (pruned each run). */
    processedKeys?: string[];
};

export type ParseResult =
    | { ok: true; event: NormalizedRecEvent }
    | { ok: false; reason: string };

const REC_EVENT_TYPES = new Set<string>(["rec_show", "rec_click", "rec_challenge"]);

export function parseSkEpochMs(sk: string): number | null {
    const idx = sk.indexOf("#");
    if (idx <= 0) {
        return null;
    }
    const epoch = Number.parseInt(sk.slice(0, idx), 10);
    return Number.isFinite(epoch) ? epoch : null;
}

export function utcDateKey(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10);
}

export function parseRecommendationEvent(item: RawDdbItem): ParseResult {
    if (typeof item.pk !== "string" || !item.pk.startsWith(RECOMMENDS_PK_PREFIX)) {
        return { ok: false, reason: "invalid pk" };
    }
    if (typeof item.sk !== "string" || item.sk.length === 0) {
        return { ok: false, reason: "missing sk" };
    }
    const eventTimeMs = parseSkEpochMs(item.sk);
    if (eventTimeMs === null) {
        return { ok: false, reason: "invalid sk epoch" };
    }
    if (typeof item.event !== "string" || !REC_EVENT_TYPES.has(item.event)) {
        return { ok: false, reason: "invalid event" };
    }
    if (typeof item.batchId !== "string" || item.batchId.trim() === "") {
        return { ok: false, reason: "missing batchId" };
    }
    if (typeof item.surface !== "string" || item.surface.trim() === "") {
        return { ok: false, reason: "missing surface" };
    }
    if (typeof item.tier !== "string" || item.tier.trim() === "") {
        return { ok: false, reason: "missing tier" };
    }

    const event = item.event as RecEventType;
    const normalized: NormalizedRecEvent = {
        eventTimeMs,
        event,
        batchId: item.batchId.trim(),
        surface: item.surface.trim(),
        tier: item.tier.trim(),
    };

    if (event === "rec_show") {
        if (!Array.isArray(item.gameIds) || item.gameIds.length === 0) {
            return { ok: false, reason: "rec_show missing gameIds" };
        }
        if (!Array.isArray(item.reasons) || item.reasons.length !== item.gameIds.length) {
            return { ok: false, reason: "rec_show reasons length mismatch" };
        }
        normalized.gameIds = item.gameIds.map((id) => String(id).trim());
        normalized.reasons = item.reasons.map((reason) => String(reason).trim());
    }

    if (event === "rec_click") {
        if (typeof item.metaGame !== "string" || item.metaGame.trim() === "") {
            return { ok: false, reason: "rec_click missing metaGame" };
        }
        if (typeof item.position !== "number" || !Number.isInteger(item.position) || item.position < 0) {
            return { ok: false, reason: "rec_click invalid position" };
        }
        if (typeof item.reasonType !== "string" || item.reasonType.trim() === "") {
            return { ok: false, reason: "rec_click missing reasonType" };
        }
        normalized.metaGame = item.metaGame.trim();
        normalized.position = item.position;
        normalized.reasonType = item.reasonType.trim();
    }

    if (event === "rec_challenge") {
        if (typeof item.metaGame !== "string" || item.metaGame.trim() === "") {
            return { ok: false, reason: "rec_challenge missing metaGame" };
        }
        normalized.metaGame = item.metaGame.trim();
    }

    return { ok: true, event: normalized };
}

function emptyFunnelCounts(): FunnelCounts {
    return { shows: 0, clicks: 0, challenges: 0 };
}

function emptyDataQuality(): DataQuality {
    return {
        eventsParsed: 0,
        eventsSkipped: 0,
        parseErrors: 0,
        orphanClicks: 0,
        duplicateEventsPerBatch: 0,
        eventsProcessed: 0,
    };
}

export function emptyAnalyticsSlice(): AnalyticsSlice {
    return {
        totals: emptyFunnelCounts(),
        rates: { ctr: 0, challengeRate: 0, endToEndRate: 0 },
        bySurface: {},
        byTier: {},
        byReasonType: {},
        topClickedMetaGames: [],
        topChallengedMetaGames: [],
        positionHistogram: {},
        dataQuality: emptyDataQuality(),
    };
}

export function computeRates(totals: FunnelCounts): FunnelRates {
    return {
        ctr: totals.shows > 0 ? totals.clicks / totals.shows : 0,
        challengeRate: totals.clicks > 0 ? totals.challenges / totals.clicks : 0,
        endToEndRate: totals.shows > 0 ? totals.challenges / totals.shows : 0,
    };
}

function getOrCreateDimension(
    map: Record<string, DimensionFunnel>,
    key: string,
): DimensionFunnel {
    const existing = map[key];
    if (existing !== undefined) {
        return existing;
    }
    const created: DimensionFunnel = { shows: 0, clicks: 0, challenges: 0 };
    map[key] = created;
    return created;
}

function getOrCreateReasonType(map: Record<string, ReasonTypeCounts>, key: string): ReasonTypeCounts {
    const existing = map[key];
    if (existing !== undefined) {
        return existing;
    }
    const created: ReasonTypeCounts = { clicks: 0, showReasons: 0 };
    map[key] = created;
    return created;
}

function applyDimensionRates(map: Record<string, DimensionFunnel>): void {
    for (const slice of Object.values(map)) {
        if (slice.shows >= MIN_RATE_DENOMINATOR) {
            slice.ctr = slice.clicks / slice.shows;
            slice.endToEndRate = slice.challenges / slice.shows;
        }
        if (slice.clicks >= MIN_RATE_DENOMINATOR) {
            slice.challengeRate = slice.challenges / slice.clicks;
        }
    }
}

function topMetaGames(counts: Map<string, number>): MetaGameCount[] {
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_META_GAMES)
        .map(([metaGame, count]) => ({ metaGame, count }));
}

type BatchAccumulator = {
    showCount: number;
    clickCount: number;
    challengeCount: number;
    showSurface?: string;
    showTier?: string;
    showReasons: string[];
    clickSurfaces: string[];
    clickTiers: string[];
    clickReasonTypes: string[];
    clickMetaGames: string[];
    clickPositions: number[];
    challengeSurfaces: string[];
    challengeTiers: string[];
    challengeMetaGames: string[];
};

function getOrCreateBatch(map: Map<string, BatchAccumulator>, batchId: string): BatchAccumulator {
    const existing = map.get(batchId);
    if (existing !== undefined) {
        return existing;
    }
    const created: BatchAccumulator = {
        showCount: 0,
        clickCount: 0,
        challengeCount: 0,
        showReasons: [],
        clickSurfaces: [],
        clickTiers: [],
        clickReasonTypes: [],
        clickMetaGames: [],
        clickPositions: [],
        challengeSurfaces: [],
        challengeTiers: [],
        challengeMetaGames: [],
    };
    map.set(batchId, created);
    return created;
}

export function aggregateEvents(events: NormalizedRecEvent[]): AnalyticsSlice {
    const slice = emptyAnalyticsSlice();
    const batches = new Map<string, BatchAccumulator>();
    let duplicateEventsPerBatch = 0;

    for (const event of events) {
        slice.dataQuality.eventsParsed += 1;
        const batch = getOrCreateBatch(batches, event.batchId);

        if (event.event === "rec_show") {
            if (batch.showCount > 0) {
                duplicateEventsPerBatch += 1;
            }
            batch.showCount += 1;
            batch.showSurface = event.surface;
            batch.showTier = event.tier;
            if (event.reasons !== undefined) {
                batch.showReasons.push(...event.reasons);
            }
        } else if (event.event === "rec_click") {
            if (batch.clickCount > 0) {
                duplicateEventsPerBatch += 1;
            }
            batch.clickCount += 1;
            batch.clickSurfaces.push(event.surface);
            batch.clickTiers.push(event.tier);
            if (event.reasonType !== undefined) {
                batch.clickReasonTypes.push(event.reasonType);
            }
            if (event.metaGame !== undefined) {
                batch.clickMetaGames.push(event.metaGame);
            }
            if (event.position !== undefined) {
                batch.clickPositions.push(event.position);
            }
        } else if (event.event === "rec_challenge") {
            if (batch.challengeCount > 0) {
                duplicateEventsPerBatch += 1;
            }
            batch.challengeCount += 1;
            batch.challengeSurfaces.push(event.surface);
            batch.challengeTiers.push(event.tier);
            if (event.metaGame !== undefined) {
                batch.challengeMetaGames.push(event.metaGame);
            }
        }
    }

    const clickedMetaGames = new Map<string, number>();
    const challengedMetaGames = new Map<string, number>();
    let orphanClicks = 0;

    for (const batch of batches.values()) {
        if (batch.showCount > 0) {
            slice.totals.shows += 1;
            const surface = batch.showSurface ?? "unknown";
            const tier = batch.showTier ?? "unknown";
            getOrCreateDimension(slice.bySurface, surface).shows += 1;
            getOrCreateDimension(slice.byTier, tier).shows += 1;
            for (const reason of batch.showReasons) {
                getOrCreateReasonType(slice.byReasonType, reason).showReasons += 1;
            }
        }

        slice.totals.clicks += batch.clickCount;
        slice.totals.challenges += batch.challengeCount;

        if (batch.clickCount > 0 && batch.showCount === 0) {
            orphanClicks += batch.clickCount;
        }

        for (const surface of batch.clickSurfaces) {
            getOrCreateDimension(slice.bySurface, surface).clicks += 1;
        }
        for (const tier of batch.clickTiers) {
            getOrCreateDimension(slice.byTier, tier).clicks += 1;
        }
        for (const reasonType of batch.clickReasonTypes) {
            getOrCreateReasonType(slice.byReasonType, reasonType).clicks += 1;
        }
        for (const surface of batch.challengeSurfaces) {
            getOrCreateDimension(slice.bySurface, surface).challenges += 1;
        }
        for (const tier of batch.challengeTiers) {
            getOrCreateDimension(slice.byTier, tier).challenges += 1;
        }
        for (const metaGame of batch.clickMetaGames) {
            clickedMetaGames.set(metaGame, (clickedMetaGames.get(metaGame) ?? 0) + 1);
        }
        for (const metaGame of batch.challengeMetaGames) {
            challengedMetaGames.set(metaGame, (challengedMetaGames.get(metaGame) ?? 0) + 1);
        }
        for (const position of batch.clickPositions) {
            if (position <= MAX_POSITION) {
                const key = String(position);
                slice.positionHistogram[key] = (slice.positionHistogram[key] ?? 0) + 1;
            }
        }
    }

    slice.dataQuality.orphanClicks = orphanClicks;
    slice.dataQuality.duplicateEventsPerBatch = duplicateEventsPerBatch;
    slice.dataQuality.eventsProcessed = events.length;
    slice.rates = computeRates(slice.totals);
    applyDimensionRates(slice.bySurface);
    applyDimensionRates(slice.byTier);
    slice.topClickedMetaGames = topMetaGames(clickedMetaGames);
    slice.topChallengedMetaGames = topMetaGames(challengedMetaGames);

    return slice;
}

function addFunnelCounts(target: FunnelCounts, source: FunnelCounts): void {
    target.shows += source.shows;
    target.clicks += source.clicks;
    target.challenges += source.challenges;
}

function mergeDimensionMaps(
    target: Record<string, DimensionFunnel>,
    source: Record<string, DimensionFunnel>,
): void {
    for (const [key, value] of Object.entries(source)) {
        const dim = getOrCreateDimension(target, key);
        addFunnelCounts(dim, value);
    }
}

function mergeReasonTypeMaps(
    target: Record<string, ReasonTypeCounts>,
    source: Record<string, ReasonTypeCounts>,
): void {
    for (const [key, value] of Object.entries(source)) {
        const reason = getOrCreateReasonType(target, key);
        reason.clicks += value.clicks;
        reason.showReasons += value.showReasons;
    }
}

function mergeMetaGameCounts(target: Map<string, number>, source: MetaGameCount[]): void {
    for (const { metaGame, count } of source) {
        target.set(metaGame, (target.get(metaGame) ?? 0) + count);
    }
}

function mergeHistogram(
    target: Record<string, number>,
    source: Record<string, number>,
): void {
    for (const [key, count] of Object.entries(source)) {
        target[key] = (target[key] ?? 0) + count;
    }
}

function mergeDataQuality(target: DataQuality, source: DataQuality): void {
    target.eventsParsed += source.eventsParsed;
    target.eventsSkipped += source.eventsSkipped;
    target.parseErrors += source.parseErrors;
    target.orphanClicks += source.orphanClicks;
    target.duplicateEventsPerBatch += source.duplicateEventsPerBatch;
    target.eventsProcessed += source.eventsProcessed;
}

export function mergeSlices(slices: AnalyticsSlice[]): AnalyticsSlice {
    if (slices.length === 0) {
        return emptyAnalyticsSlice();
    }

    const merged = emptyAnalyticsSlice();
    const clickedMetaGames = new Map<string, number>();
    const challengedMetaGames = new Map<string, number>();

    for (const slice of slices) {
        addFunnelCounts(merged.totals, slice.totals);
        mergeDimensionMaps(merged.bySurface, slice.bySurface);
        mergeDimensionMaps(merged.byTier, slice.byTier);
        mergeReasonTypeMaps(merged.byReasonType, slice.byReasonType);
        mergeMetaGameCounts(clickedMetaGames, slice.topClickedMetaGames);
        mergeMetaGameCounts(challengedMetaGames, slice.topChallengedMetaGames);
        mergeHistogram(merged.positionHistogram, slice.positionHistogram);
        mergeDataQuality(merged.dataQuality, slice.dataQuality);
    }

    merged.rates = computeRates(merged.totals);
    applyDimensionRates(merged.bySurface);
    applyDimensionRates(merged.byTier);
    merged.topClickedMetaGames = topMetaGames(clickedMetaGames);
    merged.topChallengedMetaGames = topMetaGames(challengedMetaGames);

    return merged;
}

export function buildRollingSlice(
    dailySlices: Array<{ date: string; slice: AnalyticsSlice }>,
    asOfDate: string,
    windowDays: number,
): AnalyticsSlice {
    const startMs = Date.parse(`${asOfDate}T00:00:00.000Z`) - (windowDays - 1) * 86_400_000;
    const startDate = utcDateKey(startMs);
    const selected = dailySlices
        .filter(({ date }) => date >= startDate && date <= asOfDate)
        .map(({ slice }) => slice);
    return mergeSlices(selected);
}

export function buildAnalyticsSummary(
    windowSlice: AnalyticsSlice,
    dailySlices: Array<{ date: string; slice: AnalyticsSlice }>,
    asOfDate: string,
): AnalyticsSummary {
    return {
        ...windowSlice,
        rolling7d: buildRollingSlice(dailySlices, asOfDate, 7),
        rolling30d: buildRollingSlice(dailySlices, asOfDate, 30),
    };
}

export function ingestRawItems(items: RawDdbItem[]): {
    events: NormalizedRecEvent[];
    dataQuality: Pick<DataQuality, "eventsSkipped" | "parseErrors">;
} {
    const events: NormalizedRecEvent[] = [];
    let eventsSkipped = 0;
    let parseErrors = 0;

    for (const item of items) {
        const parsed = parseRecommendationEvent(item);
        if (!parsed.ok) {
            parseErrors += 1;
            continue;
        }
        events.push(parsed.event);
    }

    eventsSkipped = items.length - events.length - parseErrors;

    return { events, dataQuality: { eventsSkipped, parseErrors } };
}

export function itemDedupeKey(item: RawDdbItem): string | null {
    if (typeof item.pk !== "string" || typeof item.sk !== "string") {
        return null;
    }
    return `${item.pk}::${item.sk}`;
}

export function skFromDedupeKey(key: string): string | null {
    const idx = key.indexOf("::");
    if (idx < 0) {
        return null;
    }
    return key.slice(idx + 2);
}

export function pruneProcessedKeys(
    keys: string[],
    minSkEpochMs: number,
): string[] {
    return keys.filter((key) => {
        const sk = skFromDedupeKey(key);
        if (sk === null) {
            return false;
        }
        const epoch = parseSkEpochMs(sk);
        return epoch !== null && epoch >= minSkEpochMs;
    });
}

function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
}

function formatDelta(current: number, previous: number): string {
    if (previous === 0) {
        return current === 0 ? "—" : "+∞";
    }
    const delta = ((current - previous) / previous) * 100;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}%`;
}

function markdownTable(headers: string[], rows: string[][]): string {
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    return [headerRow, separator, body].filter((line) => line.length > 0).join("\n");
}

export type MarkdownReportInput = {
    runDate: string;
    summary: AnalyticsSummary;
    priorWeek?: AnalyticsSlice;
};

export function buildMarkdownReport({ runDate, summary, priorWeek }: MarkdownReportInput): string {
    const lines: string[] = [
        `# Recommendation analytics — ${runDate}`,
        "",
        `Generated: ${summary.generatedAt ?? "unknown"}`,
        "",
    ];

    if (summary.window !== undefined) {
        lines.push(
            `Window: ${summary.window.start} → ${summary.window.end}`,
            "",
        );
    }

    if (summary.totals.shows === 0) {
        lines.push(
            "## No recommendation impressions",
            "",
            "No `rec_show` events were recorded in this window. CTR and funnel metrics are not meaningful.",
            "",
        );
    }

    lines.push(
        "## Funnel (window)",
        "",
        markdownTable(
            ["Metric", "Value"],
            [
                ["Shows", String(summary.totals.shows)],
                ["Clicks", String(summary.totals.clicks)],
                ["Challenges", String(summary.totals.challenges)],
                ["CTR", formatRate(summary.rates.ctr)],
                ["Challenge rate", formatRate(summary.rates.challengeRate)],
                ["End-to-end rate", formatRate(summary.rates.endToEndRate)],
            ],
        ),
        "",
    );

    const surfaceRows = Object.entries(summary.bySurface)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([surface, dim]) => [
            surface,
            String(dim.shows),
            String(dim.clicks),
            dim.ctr !== undefined ? formatRate(dim.ctr) : "—",
        ]);
    if (surfaceRows.length > 0) {
        lines.push(
            "## By surface",
            "",
            markdownTable(["Surface", "Shows", "Clicks", "CTR"], surfaceRows),
            "",
        );
    }

    const tierRows = Object.entries(summary.byTier)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([tier, dim]) => [
            tier,
            String(dim.shows),
            String(dim.clicks),
            dim.ctr !== undefined ? formatRate(dim.ctr) : "—",
        ]);
    if (tierRows.length > 0) {
        lines.push(
            "## By tier",
            "",
            markdownTable(["Tier", "Shows", "Clicks", "CTR"], tierRows),
            "",
        );
    }

    const reasonRows = Object.entries(summary.byReasonType)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([reason, counts]) => [
            reason,
            String(counts.showReasons),
            String(counts.clicks),
        ]);
    if (reasonRows.length > 0) {
        lines.push(
            "## By reason type",
            "",
            markdownTable(["Reason", "Show slots", "Clicks"], reasonRows),
            "",
        );
    }

    if (summary.topClickedMetaGames.length > 0) {
        lines.push(
            "## Top clicked meta-games (window)",
            "",
            markdownTable(
                ["Meta-game", "Clicks"],
                summary.topClickedMetaGames.map(({ metaGame, count }) => [metaGame, String(count)]),
            ),
            "",
        );
    }

    if (summary.topChallengedMetaGames.length > 0) {
        lines.push(
            "## Top challenged meta-games (window)",
            "",
            markdownTable(
                ["Meta-game", "Challenges"],
                summary.topChallengedMetaGames.map(({ metaGame, count }) => [metaGame, String(count)]),
            ),
            "",
        );
    }

    const rolling = summary.rolling7d;
    const prior = priorWeek?.totals;
    if (prior !== undefined) {
        lines.push(
            "## Week-over-week (rolling 7d vs prior 7d)",
            "",
            markdownTable(
                ["Metric", "Current 7d", "Prior 7d", "Delta"],
                [
                    ["Shows", String(rolling.totals.shows), String(prior.shows), formatDelta(rolling.totals.shows, prior.shows)],
                    ["Clicks", String(rolling.totals.clicks), String(prior.clicks), formatDelta(rolling.totals.clicks, prior.clicks)],
                    ["CTR", formatRate(rolling.rates.ctr), formatRate(computeRates(prior).ctr), formatDelta(rolling.rates.ctr, computeRates(prior).ctr)],
                ],
            ),
            "",
        );
    } else {
        lines.push(
            "## Rolling 7d",
            "",
            markdownTable(
                ["Metric", "Value"],
                [
                    ["Shows", String(rolling.totals.shows)],
                    ["Clicks", String(rolling.totals.clicks)],
                    ["CTR", formatRate(rolling.rates.ctr)],
                ],
            ),
            "",
        );
    }

    lines.push(
        "## Data quality",
        "",
        markdownTable(
            ["Metric", "Value"],
            [
                ["Events processed", String(summary.dataQuality.eventsProcessed)],
                ["Parse errors", String(summary.dataQuality.parseErrors)],
                ["Orphan clicks", String(summary.dataQuality.orphanClicks)],
                ["Duplicate events per batch", String(summary.dataQuality.duplicateEventsPerBatch)],
            ],
        ),
        "",
        "## Review notes for agents",
        "",
        "Current hybrid warm-tier weights in the front-end recommender (reference only — not tuned from this job):",
        "",
        markdownTable(
            ["Signal", "Weight"],
            Object.entries(HYBRID_WEIGHTS_REFERENCE).map(([signal, weight]) => [signal, String(weight)]),
        ),
        "",
        "Live recommender does **not** read these analytics artifacts. Use metrics here to inform future weight or product decisions manually.",
        "",
    );

    return lines.join("\n");
}
