export type ObjectHead = {
    key: string;
    lastModified: Date;
};

export type ThumbnailFreshnessMismatch = {
    meta: string;
    jsonKey: string;
    svgKey: string;
    jsonLastModified: string;
    svgLastModified: string | null;
    reason: "missing-svg" | "svg-older-than-json";
};

/**
 * Metas whose light SVG is missing or older than the JSON thumbnail.
 * `brokenMetas` are excluded (JSON-only games).
 */
export function findThumbnailFreshnessMismatches(
    metas: string[],
    heads: Map<string, ObjectHead>,
    brokenMetas: readonly string[] = [],
): ThumbnailFreshnessMismatch[] {
    const broken = new Set(brokenMetas);
    const mismatches: ThumbnailFreshnessMismatch[] = [];

    for (const meta of metas) {
        if (broken.has(meta)) {
            continue;
        }
        const jsonKey = `${meta}.json`;
        const svgKey = `${meta}-light.svg`;
        const jsonHead = heads.get(jsonKey);
        if (!jsonHead) {
            continue;
        }
        const svgHead = heads.get(svgKey);
        if (!svgHead) {
            mismatches.push({
                meta,
                jsonKey,
                svgKey,
                jsonLastModified: jsonHead.lastModified.toISOString(),
                svgLastModified: null,
                reason: "missing-svg",
            });
            continue;
        }
        if (svgHead.lastModified < jsonHead.lastModified) {
            mismatches.push({
                meta,
                jsonKey,
                svgKey,
                jsonLastModified: jsonHead.lastModified.toISOString(),
                svgLastModified: svgHead.lastModified.toISOString(),
                reason: "svg-older-than-json",
            });
        }
    }

    return mismatches.sort((a, b) => a.meta.localeCompare(b.meta));
}
