import type { Tournament } from "types/index.js";

/** Resolve a game `tournament` field to the matching dump row (active or archived). */
export function findTournamentForGame(
    tournaments: Tournament[],
    tournamentRef: string,
    metaGame: string,
): Tournament | undefined {
    const direct = tournaments.find(t => t.id === tournamentRef || t.sk === tournamentRef);
    if (direct !== undefined) {
        return direct;
    }

    const uuidFromRef = tournamentRef.includes("#")
        ? tournamentRef.slice(tournamentRef.indexOf("#") + 1)
        : tournamentRef;

    return tournaments.find(t =>
        t.id === uuidFromRef ||
        t.sk === `${metaGame}#${uuidFromRef}`
    );
}
