import type { SQSEvent, SQSRecord } from "aws-lambda";
import {
  deleteConnection,
  gameWatchKey,
  isLegacyGameFanout,
  listAllConnections,
  usesStrictGameWatch,
  watchingGamesHas,
  wantsPresenceUpdates,
  type WsConnectionItem,
} from "../../lib/wsConnectionStore.js";
import { postToMany } from "../../lib/wsPost.js";

type MsgBody = {
  domainName: string;
  stage: string;
  verb: string;
  payload?: { meta?: string; id?: string; type?: string };
  exclude?: string[];
};

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    await processRecord(record);
  }
  return { statusCode: 200 };
};

async function processRecord(record: SQSRecord) {
  let body: MsgBody;
  try {
    body = JSON.parse(record.body);
  } catch {
    console.error("Invalid SQS message JSON", record.body);
    return;
  }

  const { verb, payload, exclude } = body;

  if (!["chat", "game", "test", "connections"].includes(verb)) {
    console.warn("Unsupported verb:", verb);
    return;
  }

  const connections = await listAllConnections();
  const now = Math.floor(Date.now() / 1000);
  const targets: { endpoint: string; connectionId: string }[] = [];

  for (const conn of connections) {
    if (conn.ttl && conn.ttl < now) {
      await deleteConnection(conn.sk);
      continue;
    }

    if (exclude?.includes(conn.userId)) {
      continue;
    }

    if (!shouldDeliver(verb, conn, payload)) {
      continue;
    }

    targets.push({ endpoint: conn.endpoint, connectionId: conn.sk });
  }

  await postToMany(targets, { verb, payload });
}

function shouldDeliver(
  verb: string,
  conn: WsConnectionItem,
  payload?: MsgBody["payload"]
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

  if (verb === "connections") {
    if (payload?.type === "delta" || payload?.type === "snapshot") {
      return wantsPresenceUpdates(conn);
    }
    return wantsPresenceUpdates(conn);
  }

  return true;
}
