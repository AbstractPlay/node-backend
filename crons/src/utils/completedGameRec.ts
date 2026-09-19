type GameRecFields = {
    pk?: string;
    sk?: string;
    state?: string;
    metaGame?: string;
    players?: unknown;
};

/** metaGame field, or first segment of `meta#cbit#id` sk. */
export function resolveGameMetaGame(rec: { metaGame?: string; sk?: string }): string | undefined {
    if (typeof rec.metaGame === "string" && rec.metaGame.length > 0) {
        return rec.metaGame;
    }
    if (typeof rec.sk === "string") {
        const metaGame = rec.sk.split("#")[0];
        if (metaGame.length > 0) {
            return metaGame;
        }
    }
    return undefined;
}

function hasPlayers(rec: { players?: unknown }): boolean {
    return Array.isArray(rec.players)
        && rec.players.length > 0
        && rec.players.every((p) => typeof (p as { id?: string }).id === "string");
}

/** Active or completed GAME rows that can be passed to GameFactory / move extraction. */
export function gameRecHasPlayableState(rec: GameRecFields): boolean {
    return rec.pk === "GAME"
        && typeof rec.sk === "string"
        && rec.state !== undefined
        && rec.state !== ""
        && resolveGameMetaGame(rec) !== undefined
        && hasPlayers(rec);
}

/** Completed GAME dump rows need serialized rules state and players for GameFactory / genRecord. */
export function completedGameRecHasState(rec: GameRecFields): boolean {
    return rec.pk === "GAME"
        && typeof rec.sk === "string"
        && rec.sk.includes("#1#")
        && gameRecHasPlayableState(rec);
}

export function skipCompletedGameWithoutState(rec: GameRecFields & Record<string, unknown>): boolean {
    if (rec.pk !== "GAME" || typeof rec.sk !== "string" || !rec.sk.includes("#1#")) {
        return false;
    }
    if (completedGameRecHasState(rec)) {
        return false;
    }
    console.warn(
        `Skipping completed GAME without playable state: sk=${rec.sk} keys=${Object.keys(rec).join(",")}`,
    );
    return true;
}
