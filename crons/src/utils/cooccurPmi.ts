/** PMI co-occurrence artifact for game recommendations (front-end hybrid merge). */

export const DEFAULT_MIN_COOCCURRENCE = 5;
export const DEFAULT_TOP_K = 20;

export type CooccurNeighbor = {
    metaGame: string;
    pmi: number;
    count: number;
};

export type CooccurArtifact = {
    generatedAt: string;
    minCooccurrence: number;
    /** When true, starred games were unioned into each player's co-play set. */
    includeStarredBoost: boolean;
    games: Record<string, CooccurNeighbor[]>;
};

/** Lexicographic pair key for unordered meta-game pair (A, B). */
export function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function unionCoPlaySet(played: Iterable<string>, starred: Iterable<string>): Set<string> {
    const set = new Set(played);
    for (const meta of starred) {
        set.add(meta);
    }
    return set;
}

export function incrementPairCounts(coPlaySet: Set<string>, pairCounts: Map<string, number>): void {
    const games = [...coPlaySet].sort();
    for (let i = 0; i < games.length; i++) {
        for (let j = i + 1; j < games.length; j++) {
            const key = pairKey(games[i]!, games[j]!);
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
    }
}

export function incrementGamePlayerCounts(
    coPlaySet: Set<string>,
    gamePlayerCounts: Map<string, number>,
): void {
    for (const meta of coPlaySet) {
        gamePlayerCounts.set(meta, (gamePlayerCounts.get(meta) ?? 0) + 1);
    }
}

export function computePmi(pairCount: number, countA: number, countB: number, numPlayers: number): number {
    return Math.log((pairCount * numPlayers) / (countA * countB));
}

export type BuildCooccurOptions = {
    minCooccurrence?: number;
    topK?: number;
    includeStarredBoost: boolean;
    generatedAt?: string;
};

/**
 * Build the co-occurrence artifact from per-player co-play sets.
 * Each set is the union of completed meta-games and (optionally) starred meta-games.
 */
export function buildCooccurArtifact(
    playerCoPlaySets: Iterable<Set<string>>,
    options: BuildCooccurOptions,
): CooccurArtifact {
    const minCooccurrence = options.minCooccurrence ?? DEFAULT_MIN_COOCCURRENCE;
    const topK = options.topK ?? DEFAULT_TOP_K;
    const pairCounts = new Map<string, number>();
    const gamePlayerCounts = new Map<string, number>();
    let numPlayers = 0;

    for (const coPlaySet of playerCoPlaySets) {
        if (coPlaySet.size === 0) {
            continue;
        }
        numPlayers++;
        incrementPairCounts(coPlaySet, pairCounts);
        incrementGamePlayerCounts(coPlaySet, gamePlayerCounts);
    }

    const neighborsByGame = new Map<string, CooccurNeighbor[]>();

    for (const [key, count] of pairCounts.entries()) {
        if (count < minCooccurrence) {
            continue;
        }
        const [a, b] = key.split("|") as [string, string];
        const countA = gamePlayerCounts.get(a);
        const countB = gamePlayerCounts.get(b);
        if (countA === undefined || countB === undefined || numPlayers === 0) {
            continue;
        }
        const pmiAB = computePmi(count, countA, countB, numPlayers);
        const pmiBA = computePmi(count, countB, countA, numPlayers);

        const listA = neighborsByGame.get(a) ?? [];
        listA.push({ metaGame: b, pmi: pmiAB, count });
        neighborsByGame.set(a, listA);

        const listB = neighborsByGame.get(b) ?? [];
        listB.push({ metaGame: a, pmi: pmiBA, count });
        neighborsByGame.set(b, listB);
    }

    const games: Record<string, CooccurNeighbor[]> = {};
    for (const [meta, neighbors] of neighborsByGame.entries()) {
        neighbors.sort((x, y) => y.pmi - x.pmi || y.count - x.count || x.metaGame.localeCompare(y.metaGame));
        games[meta] = neighbors.slice(0, topK);
    }

    return {
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        minCooccurrence,
        includeStarredBoost: options.includeStarredBoost,
        games,
    };
}
