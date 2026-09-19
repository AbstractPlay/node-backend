import { describe, expect, it } from "vitest";
import type { Tournament } from "types/index.js";
import { findTournamentForGame } from "./recordTournament.js";

const TOURNAMENT_ID = "ca7cc52c-966c-48a3-8237-5195ea7c84ac";

function makeTournament(overrides: Partial<Tournament> & Pick<Tournament, "pk" | "sk" | "id">): Tournament {
    return {
        metaGame: "zola",
        variants: [],
        number: 42,
        started: true,
        dateCreated: 0,
        datePreviousEnded: 0,
        ...overrides,
    };
}

describe("findTournamentForGame", () => {
    const active = makeTournament({
        pk: "TOURNAMENT",
        sk: TOURNAMENT_ID,
        id: TOURNAMENT_ID,
    });
    const archived = makeTournament({
        pk: "COMPLETEDTOURNAMENT",
        sk: `zola#${TOURNAMENT_ID}`,
        id: TOURNAMENT_ID,
    });

    it("matches an active tournament by plain uuid", () => {
        expect(findTournamentForGame([active, archived], TOURNAMENT_ID, "zola")).toBe(active);
    });

    it("matches an archived tournament when the game stores metaGame#uuid", () => {
        expect(findTournamentForGame([active, archived], `zola#${TOURNAMENT_ID}`, "zola")).toBe(archived);
    });

    it("matches an archived tournament when the game stores plain uuid", () => {
        expect(findTournamentForGame([archived], TOURNAMENT_ID, "zola")).toBe(archived);
    });

    it("returns undefined when no tournament row matches", () => {
        expect(findTournamentForGame([archived], "missing-id", "zola")).toBeUndefined();
    });
});
