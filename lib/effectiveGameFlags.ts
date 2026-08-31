import { gameinfo, type GameBase } from "@abstractplay/gameslib";
import * as APGames from "@abstractplay/gameslib";

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
      variants: state.variants,
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
