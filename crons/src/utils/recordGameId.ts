/** Encode/decode stable metaGame + variant UIDs in `header.site.gameid`. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedRecordGameId = {
    instanceId: string;
    metaGame: string;
    /** Canonical sorted variant UIDs (empty when none). */
    variantUids: string[];
    legacy: boolean;
};

/** Sorted variant UIDs joined with `|`, or `""` when none. */
export function variantComboKey(variantUids: readonly string[]): string {
    if (variantUids.length === 0) {
        return "";
    }
    return [...variantUids].sort().join("|");
}

/** `{instanceId}#{metaGame}:{sortedVariantUids}` — trailing colon when no variants. */
export function encodeRecordGameId(
    instanceId: string,
    metaGame: string,
    variantUids: readonly string[],
): string {
    return `${instanceId}#${metaGame}:${variantComboKey(variantUids)}`;
}

export function parseRecordGameId(gameid: string): ParsedRecordGameId | undefined {
    if (gameid.length === 0) {
        return undefined;
    }

    const colonIdx = gameid.indexOf(":");
    if (colonIdx !== -1) {
        const prefix = gameid.slice(0, colonIdx);
        const hashIdx = prefix.indexOf("#");
        if (hashIdx === -1) {
            return undefined;
        }
        const instanceId = prefix.slice(0, hashIdx);
        const metaGame = prefix.slice(hashIdx + 1);
        if (!UUID_RE.test(instanceId) || metaGame.length === 0) {
            return undefined;
        }
        const variantPart = gameid.slice(colonIdx + 1);
        const variantUids =
            variantPart.length === 0
                ? []
                : variantPart.split("|").filter((v) => v.length > 0);
        return {
            instanceId,
            metaGame,
            variantUids: [...variantUids].sort(),
            legacy: false,
        };
    }

    const hashIdx = gameid.indexOf("#");
    if (hashIdx === -1) {
        return undefined;
    }
    const metaGame = gameid.slice(0, hashIdx);
    const instanceId = gameid.slice(hashIdx + 1);
    if (metaGame.length === 0 || !UUID_RE.test(instanceId)) {
        return undefined;
    }
    return {
        instanceId,
        metaGame,
        variantUids: [],
        legacy: true,
    };
}
