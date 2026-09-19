import { variantComboKey } from "./recordGameId.js";

export type ResolveGameVariantsContext = {
    metaGame?: string;
    gameId?: string;
};

function normalizeVariants(variants: string[] | undefined): string[] {
    if (variants === undefined || variants.length === 0) {
        return [];
    }
    return [...new Set(variants)].sort();
}

function variantsEqual(
    a: readonly string[],
    b: readonly string[],
): boolean {
    return variantComboKey(a) === variantComboKey(b);
}

/** Prefer record variants when serialized state lost them (historical gameslib bug). */
export function resolveGameVariantUids(
    stateVariants: string[] | undefined,
    recordVariants: string[] | undefined,
    context?: ResolveGameVariantsContext,
): string[] {
    const state = normalizeVariants(stateVariants);
    const record = normalizeVariants(recordVariants);

    if (variantsEqual(state, record)) {
        return state;
    }
    if (state.length === 0 && record.length > 0) {
        return record;
    }
    if (record.length === 0 && state.length > 0) {
        return state;
    }
    console.warn(
        `Variant mismatch for ${context?.metaGame ?? "unknown"} game ${context?.gameId ?? "unknown"}: `
        + `state=${JSON.stringify(state)} record=${JSON.stringify(record)}; preferring record`,
    );
    return record;
}

export function reconcileVariantsInGameState(
    stateJson: string,
    recordVariants: string[] | undefined,
): string {
    if (recordVariants === undefined || recordVariants.length === 0) {
        return stateJson;
    }
    let parsed: { variants?: string[] };
    try {
        parsed = JSON.parse(stateJson) as { variants?: string[] };
    } catch {
        return stateJson;
    }
    const resolved = resolveGameVariantUids(parsed.variants, recordVariants);
    if (variantsEqual(parsed.variants ?? [], resolved)) {
        return stateJson;
    }
    parsed.variants = resolved;
    return JSON.stringify(parsed);
}
