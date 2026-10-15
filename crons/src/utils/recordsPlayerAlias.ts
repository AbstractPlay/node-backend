/** Legacy embedded AiAi user id (historical games; excluded from `user_names`). */
export const LEGACY_AIAI_BOT_PLAYER_ID = "SkQfHAjeDxs8eeEnScuYA";

/**
 * Prod registered AiAi bot Cognito client id (= player id in games).
 * Set via `AIAI_BOT_RECORDS_CANONICAL_ID` on the records Lambda (deploy-prod: `AIAI_BOT_ID_PROD`).
 * When empty, records keep the legacy id (no merge).
 */
export function aiaiBotRecordsCanonicalPlayerId(): string {
    return process.env.AIAI_BOT_RECORDS_CANONICAL_ID?.trim() ?? "";
}

export function canonicalRecordsPlayerId(playerId: string): string {
    const canonical = aiaiBotRecordsCanonicalPlayerId();
    if (canonical.length > 0 && playerId === LEGACY_AIAI_BOT_PLAYER_ID) {
        return canonical;
    }
    return playerId;
}

export function seedRegisteredBotIdsForRecords(): Set<string> {
    const bots = new Set<string>([LEGACY_AIAI_BOT_PLAYER_ID]);
    const canonical = aiaiBotRecordsCanonicalPlayerId();
    if (canonical.length > 0) {
        bots.add(canonical);
    }
    return bots;
}
