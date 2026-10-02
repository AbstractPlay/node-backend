import type { SQSEvent, SQSRecord } from "aws-lambda";
import {
  deleteConnection,
  listAllConnections,
} from "../../lib/wsConnectionStore.js";
import {
  shouldDeliverWsMessage,
  type WsBroadcastPayload,
} from "../../lib/wsMessageDelivery.js";
import { postToMany } from "../../lib/wsPost.js";

const SUPPORTED_VERBS = ["chat", "game", "test", "connections", "notification"];

type MsgBody = {
  domainName: string;
  stage: string;
  verb: string;
  payload?: WsBroadcastPayload;
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

  if (!SUPPORTED_VERBS.includes(verb)) {
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

    if (!shouldDeliverWsMessage(verb, conn, payload)) {
      continue;
    }

    targets.push({ endpoint: conn.endpoint, connectionId: conn.sk });
  }

  await postToMany(targets, { verb, payload });
}
