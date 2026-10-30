import { wsBroadcast } from '../wsBroadcast.js';
import { seatUserIds } from './table/eligibility.js';
import type { ArenaTableRecord } from './table/types.js';

export type ArenaTableWsEvent = 'join' | 'leave' | 'ready';

/** Notify seated players (except the actor) about lobby seat activity. */
export async function broadcastArenaTableActivity(
  table: Pick<ArenaTableRecord, 'tableId' | 'metaGame' | 'state' | 'seats'>,
  event: ArenaTableWsEvent,
  actorUserId: string,
): Promise<void> {
  const seated = seatUserIds(table as ArenaTableRecord);
  const recipients = seated.filter((id) => id && id !== actorUserId);
  if (recipients.length === 0) {
    return;
  }
  await Promise.all(
    recipients.map((userId) =>
      wsBroadcast('arena_table', {
        userId,
        tableId: table.tableId,
        metaGame: table.metaGame,
        tableState: table.state,
        seatUserIds: seated,
        event,
        actorUserId,
      }),
    ),
  );
}
