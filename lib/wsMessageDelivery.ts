import {
  gameWatchKey,
  isLegacyGameFanout,
  usesStrictGameWatch,
  watchingGamesHas,
  watchingTournamentsHas,
  watchingLaddersHas,
  wantsPresenceUpdates,
  type WsConnectionItem,
} from "./wsConnectionStore.js";

export type WsBroadcastPayload = {
  meta?: string;
  id?: string;
  type?: string;
  userId?: string;
};

export function shouldDeliverWsMessage(
  verb: string,
  conn: WsConnectionItem,
  payload?: WsBroadcastPayload,
): boolean {
  if (verb === "game" || verb === "chat") {
    const meta = payload?.meta;
    const id = payload?.id;
    if (!meta || !id) {
      return false;
    }
    const key = gameWatchKey(meta, id);

    if (isLegacyGameFanout(conn)) {
      return true;
    }
    if (usesStrictGameWatch(conn)) {
      return watchingGamesHas(conn, key);
    }
    return watchingGamesHas(conn, key);
  }

  if (verb === "tournament") {
    const id = payload?.id;
    if (!id) {
      return false;
    }
    return watchingTournamentsHas(conn, id);
  }

  if (verb === "ladder") {
    const id = payload?.id;
    if (!id) {
      return false;
    }
    return watchingLaddersHas(conn, id);
  }

  if (verb === "notification") {
    const userId = payload?.userId;
    if (!userId) {
      return false;
    }
    return conn.userId === userId;
  }

  if (verb === "arena_launch" || verb === "arena_sync") {
    const userId = payload?.userId;
    if (!userId) {
      return false;
    }
    return conn.userId === userId;
  }

  if (verb === "connections") {
    if (payload?.type === "delta" || payload?.type === "snapshot") {
      return wantsPresenceUpdates(conn);
    }
    return wantsPresenceUpdates(conn);
  }

  return true;
}
