import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGameRecordForDumpRow } from "./archiveGameRecord.js";
import {
    canonicalRecordsPlayerId,
    LEGACY_AIAI_BOT_PLAYER_ID,
    seedRegisteredBotIdsForRecords,
} from "./recordsPlayerAlias.js";
import type { GameRec } from "../types/GameRec.js";

const CANONICAL = "prod-aiai-bot-client-id";
const FIXTURE_MARKER = "records-player-alias-fixture";

vi.mock("@abstractplay/gameslib", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@abstractplay/gameslib")>();
    return {
        ...actual,
        GameFactory: (metaGame: string, state?: string, variants?: string[]) => {
            if (metaGame === "trike" && state?.includes(FIXTURE_MARKER)) {
                return {
                    variants: variants ?? [],
                    genRecord: (opts: {
                        players: { uid: string; name: string; isai?: boolean }[];
                    }) => ({
                        header: {
                            game: { name: "Trike", variants: [] },
                            site: { name: "Abstract Play", gameid: "fixture" },
                            "date-start": "2024-01-01T00:00:00.000Z",
                            "date-end": "2024-01-02T00:00:00.000Z",
                            "date-generated": "2024-01-03T00:00:00.000Z",
                            players: opts.players.map((p) => ({
                                name: p.name,
                                userid: p.uid,
                                is_ai: p.isai,
                                score: 0,
                                result: 0,
                            })),
                        },
                        moves: [],
                    }),
                };
            }
            return actual.GameFactory(metaGame, state, variants);
        },
    };
});

afterEach(() => {
    delete process.env.AIAI_BOT_RECORDS_CANONICAL_ID;
});

describe("recordsPlayerAlias", () => {
    it("maps legacy id when canonical env is set", () => {
        process.env.AIAI_BOT_RECORDS_CANONICAL_ID = CANONICAL;
        expect(canonicalRecordsPlayerId(LEGACY_AIAI_BOT_PLAYER_ID)).toBe(CANONICAL);
        expect(canonicalRecordsPlayerId("human-user")).toBe("human-user");
    });

    it("writes canonical userid and is_ai on completed game headers", () => {
        process.env.AIAI_BOT_RECORDS_CANONICAL_ID = CANONICAL;
        const gdata: GameRec = {
            pk: "GAME",
            sk: "trike#1#alias-test",
            id: "alias-test",
            metaGame: "trike",
            state: JSON.stringify({ [FIXTURE_MARKER]: true }),
            players: [
                { id: LEGACY_AIAI_BOT_PLAYER_ID, name: "Ai Ai", time: 1 },
                { id: "human-opponent", name: "Human", time: 2 },
            ],
        };
        const registeredBots = seedRegisteredBotIdsForRecords();
        const rec = buildGameRecordForDumpRow(gdata, {
            registeredBots,
            event: null,
            round: null,
        });
        expect(rec).toBeDefined();
        const aiPlayer = rec!.header.players.find((p) => p.is_ai === true);
        expect(aiPlayer?.userid).toBe(CANONICAL);
        expect(rec!.header.players.some((p) => p.userid === LEGACY_AIAI_BOT_PLAYER_ID)).toBe(false);
    });
});
