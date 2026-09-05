import { gameinfo, type GameBase } from "@abstractplay/gameslib";
import * as APGames from "@abstractplay/gameslib";
import { resolveGameVariantUids } from "./resolveGameVariants.js";

type SessionFlagsEngine = GameBase & {
  getFlags?: () => readonly string[];
};

type ResolveGameFlags = (
  metaGame: string,
  context: { variants?: string[]; numplayers?: number },
) => readonly string[];

/** Effective session flags for an active engine (preferred over static gameinfo). */
export function effectiveFlags(
  engine: GameBase | null | undefined,
  metaGame: string,
  recordVariants?: string[],
): readonly string[] {
  const sessionEngine = engine as SessionFlagsEngine | null | undefined;
  if (sessionEngine != null && typeof sessionEngine.getFlags === "function") {
    return sessionEngine.getFlags();
  }
  const resolveGameFlags = (APGames as { resolveGameFlags?: ResolveGameFlags })
    .resolveGameFlags;
  if (typeof resolveGameFlags === "function" && sessionEngine != null) {
    const state = sessionEngine.state() as {
      variants?: string[];
      numplayers?: number;
    };
    return resolveGameFlags(metaGame, {
      variants: resolveGameVariantUids(state.variants, recordVariants),
      numplayers: state.numplayers,
    });
  }
  return gameinfo.get(metaGame)?.flags ?? [];
}

/** Static structural flags (engine class, registry) — not session-overridable. */
export function structuralFlags(metaGame: string): readonly string[] {
  return gameinfo.get(metaGame)?.flags ?? [];
}

export function effectiveFlagsForChallenge(
  metaGame: string,
  context: { variants?: string[]; numplayers?: number } = {},
): readonly string[] {
  const resolveGameFlags = (APGames as { resolveGameFlags?: ResolveGameFlags })
    .resolveGameFlags;
  if (typeof resolveGameFlags === "function") {
    return resolveGameFlags(metaGame, context);
  }
  return gameinfo.get(metaGame)?.flags ?? [];
}

export function flagSetIncludes(
  flags: readonly string[] | undefined,
  name: string,
): boolean {
  return flags !== undefined && Array.isArray(flags) && flags.includes(name);
}

/** Set per-seat board rotation when perspective (and optionally rotate90) are active. */
export function applyPerspectivePlayerRotations(
  gamePlayers: Array<{ settings?: { rotate?: number } }>,
  playerCount: number,
  flags: readonly string[],
): void {
  if (!flagSetIncludes(flags, "perspective")) {
    return;
  }
  let rot = 180;
  if (playerCount > 2 && flagSetIncludes(flags, "rotate90")) {
    rot = -90;
  }
  for (let i = 1; i < gamePlayers.length; i++) {
    gamePlayers[i].settings = { rotate: i * rot };
  }
}
