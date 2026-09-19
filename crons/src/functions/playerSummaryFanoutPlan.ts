import type { PlayerSummaryQueueMessage } from "types/playerSummaryQueue.js";
import type { StatSummaryPlayers, StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import { playerSummarySliceContentHash, stableJsonHash } from "../utils/playerSummaryHash.js";
import {
    buildPlayerSummaryIndexesFromTiers,
    collectPlayerSummaryUserIdsFromTiers,
    toPlayerSummarySlice,
    type PlayerSummaryIndexes,
} from "./summarizeHelpers.js";

export type FanoutPlanInput = {
    generated: string;
    playersTier: StatSummaryPlayers;
    ratingsTier: StatSummaryRatings;
    previousHashes?: Record<string, string>;
    previousInputFingerprint?: string;
};

export type FanoutPlanResult = {
    messages: PlayerSummaryQueueMessage[];
    contentHashes: Record<string, string>;
    candidateCount: number;
    enqueuedCount: number;
    skippedCount: number;
    inputFingerprint: string;
    inputUnchanged: boolean;
};

function stripTierMeta<T extends { generated?: string; tier?: string }>(
    tier: T,
): Omit<T, "generated" | "tier"> {
    const { generated: _generated, tier: _tier, ...rest } = tier;
    return rest;
}

export function computePlayerSummaryInputFingerprint(
    playersTier: StatSummaryPlayers,
    ratingsTier: StatSummaryRatings,
): string {
    return stableJsonHash({
        players: stripTierMeta(playersTier),
        ratings: stripTierMeta(ratingsTier),
    });
}

function planWithIndexes(
    generated: string,
    indexes: PlayerSummaryIndexes,
    userIds: string[],
    previousHashes: Record<string, string> | undefined,
): Pick<FanoutPlanResult, "messages" | "contentHashes" | "enqueuedCount" | "skippedCount"> {
    const messages: PlayerSummaryQueueMessage[] = [];
    const contentHashes: Record<string, string> = {};
    let enqueuedCount = 0;
    let skippedCount = 0;

    for (const user of userIds) {
        const slice = toPlayerSummarySlice(user, generated, indexes);
        const hash = playerSummarySliceContentHash(slice);
        contentHashes[user] = hash;
        if (previousHashes?.[user] === hash) {
            skippedCount += 1;
            continue;
        }
        enqueuedCount += 1;
        messages.push({
            user,
            key: `player/${user}-summary.json`,
            slice,
        });
    }

    return { messages, contentHashes, enqueuedCount, skippedCount };
}

export function planPlayerSummaryFanout(input: FanoutPlanInput): FanoutPlanResult {
    const inputFingerprint = computePlayerSummaryInputFingerprint(
        input.playersTier,
        input.ratingsTier,
    );
    const userIds = collectPlayerSummaryUserIdsFromTiers(input.playersTier, input.ratingsTier);
    const candidateCount = userIds.length;
    const hasPreviousHashes = input.previousHashes !== undefined
        && Object.keys(input.previousHashes).length > 0;

    if (
        hasPreviousHashes
        && input.previousInputFingerprint === inputFingerprint
    ) {
        return {
            messages: [],
            contentHashes: input.previousHashes!,
            candidateCount,
            enqueuedCount: 0,
            skippedCount: candidateCount,
            inputFingerprint,
            inputUnchanged: true,
        };
    }

    const indexes = buildPlayerSummaryIndexesFromTiers(input.playersTier, input.ratingsTier);
    const planned = planWithIndexes(
        input.generated,
        indexes,
        userIds,
        input.previousHashes,
    );

    return {
        ...planned,
        candidateCount,
        inputFingerprint,
        inputUnchanged: false,
    };
}
