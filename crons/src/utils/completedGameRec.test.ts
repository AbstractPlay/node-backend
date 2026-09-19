import { describe, expect, it, vi } from "vitest";
import {
    completedGameRecHasState,
    gameRecHasPlayableState,
    resolveGameMetaGame,
    skipCompletedGameWithoutState,
} from "./completedGameRec.js";

describe("completedGameRec", () => {
    it("accepts completed games with state and players", () => {
        expect(completedGameRecHasState({
            pk: "GAME",
            sk: "go#1#uuid",
            metaGame: "go",
            state: "{}",
            players: [{ id: "p1", name: "A" }],
        })).toBe(true);
    });

    it("rejects completed games missing state", () => {
        expect(completedGameRecHasState({
            pk: "GAME",
            sk: "tablero#1#377080453",
            tournament: "tablero#uuid",
        })).toBe(false);
    });

    it("rejects completed games missing players even with state", () => {
        expect(completedGameRecHasState({
            pk: "GAME",
            sk: "go#1#uuid",
            metaGame: "go",
            state: "{}",
        })).toBe(false);
    });

    it("resolves metaGame from sk when field is absent", () => {
        expect(resolveGameMetaGame({
            sk: "volo#1#444727048",
        })).toBe("volo");
    });

    it("gameRecHasPlayableState accepts active games", () => {
        expect(gameRecHasPlayableState({
            pk: "GAME",
            sk: "go#0#uuid",
            metaGame: "go",
            state: "{}",
            players: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }],
        })).toBe(true);
    });

    it("logs and returns true for orphan completed games", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const rec = {
            pk: "GAME",
            sk: "tablero#1#377080453",
            tournament: "tablero#aec5b5fc-3ec4-4da9-b153-0316566660bb",
        };
        expect(skipCompletedGameWithoutState(rec)).toBe(true);
        expect(warn).toHaveBeenCalledWith(
            "Skipping completed GAME without playable state: sk=tablero#1#377080453 keys=pk,sk,tournament",
        );
        warn.mockRestore();
    });
});
