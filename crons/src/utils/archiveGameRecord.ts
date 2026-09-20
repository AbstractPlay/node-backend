import type { APGameRecord } from "@abstractplay/recranks";
import {
    GameFactory,
    archiveMetadataFor,
    getRetraction,
    shouldOmitFromRecords,
} from "@abstractplay/gameslib";
import type { GameRec } from "../types/GameRec.js";
import { decompressGameState } from "./gameState.js";
import { encodeRecordGameId } from "./recordGameId.js";
import { resolveGameVariantUids } from "./resolveGameVariants.js";
import { gameRecordIsUnrated } from "./recordUnrated.js";

type ArchivedState = {
    gameover?: boolean;
    winner?: number[];
    stack?: Array<{ _timestamp?: string | Date }>;
    variants?: string[];
    numplayers?: number;
};

function parseArchivedState(state: unknown): ArchivedState {
    if (state === null || typeof state !== "object") {
        return {};
    }
    return state as ArchivedState;
}

function playerResultForSeat(seat: number, winner: number[] | undefined): number {
    if (winner === undefined || winner.length === 0) {
        return 0;
    }
    if (winner.includes(seat)) {
        return Number.POSITIVE_INFINITY;
    }
    return Number.NEGATIVE_INFINITY;
}

function syntheticMoves(roundCount: number): APGameRecord["moves"] {
    const moves: APGameRecord["moves"] = [];
    for (let i = 0; i < roundCount; i++) {
        moves.push([{ move: "archive-stub" }]);
    }
    return moves;
}

/**
 * Build a gamerecord from Dynamo when the engine was removed but retraction policy is `include`.
 */
export function genRecordFromArchiveStub(
    gdata: GameRec,
    variantUids: string[],
    opts: {
        uid: string;
        event?: string;
        round?: string;
        unrated?: boolean;
        players: { uid: string; name: string; isai?: boolean }[];
    },
): APGameRecord | undefined {
    const meta = archiveMetadataFor(gdata.metaGame);
    if (meta === undefined) {
        return undefined;
    }
    const raw = decompressGameState(gdata.state);
    const parsed = parseArchivedState(
        raw.startsWith("{") || raw.startsWith("[") ? JSON.parse(raw) as unknown : raw,
    );
    if (parsed.gameover !== true) {
        return undefined;
    }
    const stack = parsed.stack ?? [];
    const startTs = stack[0]?._timestamp;
    const endTs = stack[stack.length - 1]?._timestamp;
    const startDate =
        startTs !== undefined ? new Date(startTs) : new Date(gdata.sk);
    const endDate =
        endTs !== undefined ? new Date(endTs) : startDate;
    const roundCount = Math.max(3, Math.max(0, stack.length - 1));
    const variantLabels =
        variantUids.length > 0 ? variantUids : (parsed.variants ?? []);

    const rec: APGameRecord = {
        header: {
            game: {
                name: meta.name,
                variants: variantLabels,
            },
            event: opts.event,
            round: opts.round,
            site: {
                name: "Abstract Play",
                gameid: opts.uid,
            },
            "date-start": startDate.toISOString(),
            "date-end": endDate.toISOString(),
            "date-generated": new Date().toISOString(),
            players: [],
        },
        moves: syntheticMoves(roundCount),
    };

    if (opts.unrated === true) {
        rec.header.unrated = true;
    }
    if (gdata.pieInvoked === true) {
        rec.header.pied = true;
    }

    const numPlayers = opts.players.length;
    for (let i = 0; i < numPlayers; i++) {
        const seat = i + 1;
        rec.header.players.push({
            name: opts.players[i]!.name,
            userid: opts.players[i]!.uid,
            is_ai: opts.players[i]!.isai,
            score: 0,
            result: playerResultForSeat(seat, parsed.winner),
        });
    }

    return rec;
}

export type RecordBuildContext = {
    registeredBots: Set<string>;
    event: string | null;
    round: string | null;
};

export function buildGameRecordForDumpRow(
    gdata: GameRec,
    ctx: RecordBuildContext,
): APGameRecord | undefined {
    if (shouldOmitFromRecords(gdata.metaGame)) {
        return undefined;
    }

    const state = decompressGameState(gdata.state);
    const g = GameFactory(gdata.metaGame, state);
    let variantUids: string[] = [];

    if (g !== undefined) {
        variantUids = resolveGameVariantUids(g.variants, gdata.variants, {
            metaGame: gdata.metaGame,
            gameId: gdata.id,
        });
        if (variantUids.length > 0 && (g.variants?.length ?? 0) === 0) {
            g.variants = variantUids;
        }
    } else {
        const retraction = getRetraction(gdata.metaGame);
        if (retraction?.recordsGeneration !== "include") {
            return undefined;
        }
        variantUids = resolveGameVariantUids([], gdata.variants, {
            metaGame: gdata.metaGame,
            gameId: gdata.id,
        });
    }

    const unrated = gameRecordIsUnrated(gdata.metaGame, variantUids, gdata.rated);
    const uid = encodeRecordGameId(gdata.id, gdata.metaGame, variantUids);
    const players = gdata.players.map((p) => ({
        uid: p.id,
        name: p.name,
        isai: ctx.registeredBots.has(p.id) ? true : undefined,
    }));

    if (g !== undefined) {
        const rec = g.genRecord({
            uid,
            players,
            event: ctx.event !== null ? ctx.event : undefined,
            round: ctx.round !== null ? ctx.round : undefined,
            unrated: unrated ? true : undefined,
        });
        if (rec === undefined) {
            throw new Error(
                `Unable to create a game report for ${gdata.metaGame} game ${gdata.id}`,
            );
        }
        if (gdata.pieInvoked === true) {
            rec.header.pied = true;
        }
        return rec;
    }

    const stub = genRecordFromArchiveStub(gdata, variantUids, {
        uid,
        players,
        event: ctx.event !== null ? ctx.event : undefined,
        round: ctx.round !== null ? ctx.round : undefined,
        unrated: unrated ? true : undefined,
    });
    if (stub === undefined) {
        throw new Error(
            `Unable to create archive stub record for ${gdata.metaGame} game ${gdata.id}`,
        );
    }
    return stub;
}
