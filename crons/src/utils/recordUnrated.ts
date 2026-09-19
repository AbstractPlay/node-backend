import { gameinfo } from "@abstractplay/gameslib";

export function hasUnratedVariant(metaGame: string, variantUids: string[]): boolean {
    const variants = gameinfo.get(metaGame)?.variants;
    if (variants === undefined) {
        return false;
    }
    const byUid = new Map(variants.map((v) => [v.uid, v]));
    for (const uid of variantUids) {
        if (byUid.get(uid)?.unrated === true) {
            return true;
        }
    }
    return false;
}

export function gameRecordIsUnrated(
    metaGame: string,
    variantUids: string[],
    rated?: boolean,
): boolean {
    return rated !== true || hasUnratedVariant(metaGame, variantUids);
}
