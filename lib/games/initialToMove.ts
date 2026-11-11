import type { GameBase } from "@abstractplay/gameslib";
import { sessionIsSimultaneous } from "../effectiveGameFlags.js";

/** Opening `toMove` for a newly created game (simultaneous boolean[] vs sequential seat index). */
export function initialToMove(
  engine: GameBase,
  metaGame: string,
  playerCount: number,
  variants?: string[],
): string | boolean[] {
  if (sessionIsSimultaneous(engine, metaGame, { variants, numplayers: playerCount })) {
    return Array.from({ length: playerCount }, () => true);
  }
  if (typeof engine.currplayer === "number") {
    return `${engine.currplayer - 1}`;
  }
  return "0";
}
