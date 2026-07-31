import type { SQSEvent, SQSRecord } from "aws-lambda";
import {
  broadcastPresenceDelta,
  mergePresenceBatch,
  type PresenceEvent,
} from "../../lib/wsPresence";

export const handler = async (event: SQSEvent) => {
  const events: PresenceEvent[] = [];

  for (const record of event.Records) {
    const ev = parseRecord(record);
    if (ev) {
      events.push(ev);
    }
  }

  const { joins, leaves } = mergePresenceBatch(events);
  await broadcastPresenceDelta(joins, leaves);

  return { statusCode: 200 };
};

function parseRecord(record: SQSRecord): PresenceEvent | null {
  try {
    const body = JSON.parse(record.body) as PresenceEvent;
    if (
      (body.type === "join" || body.type === "leave") &&
      typeof body.userId === "string"
    ) {
      return body;
    }
  } catch {
    console.error("Invalid presence coalesce message", record.body);
  }
  return null;
}
