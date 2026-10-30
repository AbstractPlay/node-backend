import { v4 as uuid } from 'uuid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createArenaGame } from '../createArenaGame.js';
import { broadcastArenaLaunch } from '../arenaSyncStart.js';
import { broadcastArenaTableActivity } from '../arenaTableActivityWs.js';
import { getArenaTimeControl } from '../timeControls.js';
import {
  createArenaTableCommentsRow,
  deleteArenaTableCommentsRow,
} from './comments.js';
import {
  assertArenaTcId,
  assertMetaGameArenaEligible,
  assertUserFreeForArenaTable,
  isSeatedOnTable,
  seatUserIds,
} from './eligibility.js';
import {
  deleteAllArenaIndexForTable,
  indexStateForTable,
  syncArenaIndexOnTableWrite,
} from './indexSync.js';
import {
  deleteArenaTable,
  deleteArenaUserSlot,
  getArenaTable,
  getArenaUserTableId,
  putArenaTable,
  putArenaUserSlot,
} from './store.js';
import type { ArenaTableRecord, ArenaTableSeat } from './types.js';
import { ARENA_TABLE_PK } from './constants.js';
import { arenaTableSk } from './keys.js';

function emptySeat(seatIndex: 0 | 1): ArenaTableSeat {
  return { userId: '', seatIndex, ready: false };
}

function cloneTable(table: ArenaTableRecord): ArenaTableRecord {
  return {
    ...table,
    seats: table.seats.map((s) => ({ ...s })),
    variants: [...table.variants],
  };
}

function withUpdated(table: ArenaTableRecord, now: number): ArenaTableRecord {
  const next = cloneTable(table);
  next.updatedAt = now;
  next.indexState = indexStateForTable(next);
  return next;
}

export type CreateArenaTableInput = {
  metaGame: string;
  arenaTcId: string;
  variants?: string[];
  open?: boolean;
  inviteUserId?: string;
};

export async function createArenaTableRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  hostId: string,
  input: CreateArenaTableInput,
): Promise<{ tableId: string } | { error: string }> {
  const metaCheck = assertMetaGameArenaEligible(input.metaGame);
  if (!metaCheck.ok) {
    return { error: metaCheck.message };
  }
  const tcCheck = assertArenaTcId(input.arenaTcId);
  if (!tcCheck.ok) {
    return { error: tcCheck.message };
  }
  const free = await assertUserFreeForArenaTable(client, tableName, hostId);
  if (!free.ok) {
    return { error: free.message };
  }
  const open = input.open !== false;
  if (!open && !input.inviteUserId) {
    return { error: 'Closed tables require inviteUserId.' };
  }
  if (input.inviteUserId === hostId) {
    return { error: 'inviteUserId must be another user.' };
  }

  const tc = getArenaTimeControl(input.arenaTcId)!;
  const now = Date.now();
  const tableId = uuid();
  const variants = input.variants ?? [];
  const table: ArenaTableRecord = {
    pk: ARENA_TABLE_PK,
    sk: arenaTableSk(tableId),
    tableId,
    state: 'open',
    indexState: 'waiting',
    metaGame: input.metaGame,
    variants,
    arenaTcId: input.arenaTcId,
    arenaClock: { startSec: tc.startSec, incSec: tc.incSec, maxSec: tc.maxSec },
    open,
    inviteUserId: open ? undefined : input.inviteUserId,
    hostId,
    seats: [
      { userId: hostId, seatIndex: 0, ready: false },
      emptySeat(1),
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await putArenaUserSlot(client, tableName, hostId, tableId);
    await createArenaTableCommentsRow(client, tableName, tableId);
    await putArenaTable(client, tableName, table);
    await syncArenaIndexOnTableWrite(client, tableName, null, table);
  } catch (err) {
    await deleteArenaUserSlot(client, tableName, hostId).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }

  return { tableId };
}

export async function joinArenaTableRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return { error: 'Arena table not found.' };
  }
  if (table.state !== 'open' && table.state !== 'seated') {
    return { error: 'This table is not accepting joins.' };
  }
  if (isSeatedOnTable(table, userId)) {
    return { ok: true };
  }
  if (seatUserIds(table).length >= 2) {
    return { error: 'Table is full.' };
  }
  if (!table.open) {
    if (table.inviteUserId !== userId) {
      return { error: 'This is a closed table.' };
    }
  }
  const free = await assertUserFreeForArenaTable(client, tableName, userId);
  if (!free.ok) {
    return { error: free.message };
  }

  const now = Date.now();
  const prev = cloneTable(table);
  const guestSeat = table.seats.find((s) => !s.userId || s.userId === '');
  if (guestSeat === undefined) {
    return { error: 'Table is full.' };
  }
  guestSeat.userId = userId;
  guestSeat.ready = false;
  if (Math.random() < 0.5) {
    const a = table.seats[0]!;
    const b = table.seats[1]!;
    const aIdx = a.seatIndex;
    a.seatIndex = b.seatIndex;
    b.seatIndex = aIdx;
    table.seats.sort((x, y) => x.seatIndex - y.seatIndex);
  }
  table.state = 'seated';
  const next = withUpdated(table, now);

  try {
    await putArenaUserSlot(client, tableName, userId, tableId);
    await putArenaTable(client, tableName, next);
    await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  } catch (err) {
    await deleteArenaUserSlot(client, tableName, userId).catch(() => undefined);
    return { error: err instanceof Error ? err.message : String(err) };
  }
  await broadcastArenaTableActivity(next, 'join', userId);
  return { ok: true };
}

export async function abandonArenaTableRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  table: ArenaTableRecord,
): Promise<void> {
  const prev = cloneTable(table);
  const next = withUpdated({ ...table, state: 'abandoned' }, Date.now());
  await deleteAllArenaIndexForTable(client, tableName, prev);
  await deleteArenaTableCommentsRow(client, tableName, table.tableId);
  await deleteArenaTable(client, tableName, table.tableId);
  for (const uid of seatUserIds(table)) {
    await deleteArenaUserSlot(client, tableName, uid).catch(() => undefined);
  }
  void next;
}

export async function leaveArenaTableRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return { error: 'Arena table not found.' };
  }
  if (!isSeatedOnTable(table, userId)) {
    return { error: 'You are not seated at this table.' };
  }
  if (table.state === 'playing' || table.state === 'launching') {
    return { error: 'Cannot leave during live play.' };
  }
  if (userId === table.hostId) {
    await broadcastArenaTableActivity(table, 'leave', userId);
    await abandonArenaTableRecord(client, tableName, table);
    return { ok: true };
  }
  const prev = cloneTable(table);
  const now = Date.now();
  const seat = table.seats.find((s) => s.userId === userId);
  if (seat) {
    seat.userId = '';
    seat.ready = false;
  }
  table.state = 'open';
  table.swapProposalUserId = undefined;
  table.seats.forEach((s) => { s.ready = false; });
  const next = withUpdated(table, now);
  await deleteArenaUserSlot(client, tableName, userId);
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  await broadcastArenaTableActivity(next, 'leave', userId);
  return { ok: true };
}

export async function cancelArenaTableRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return { error: 'Arena table not found.' };
  }
  if (userId !== table.hostId) {
    return { error: 'Only the host can cancel this table.' };
  }
  if (table.state === 'playing' || table.state === 'launching') {
    return { error: 'Cannot cancel after launch.' };
  }
  await broadcastArenaTableActivity(table, 'leave', userId);
  await abandonArenaTableRecord(client, tableName, table);
  return { ok: true };
}

export async function launchArenaTableIfReady(
  client: DynamoDBDocumentClient,
  tableName: string,
  table: ArenaTableRecord,
): Promise<ArenaTableRecord | undefined> {
  if (table.state !== 'seated') {
    return undefined;
  }
  const ids = seatUserIds(table);
  if (ids.length < 2) {
    return undefined;
  }
  if (!table.seats.every((s) => s.userId && s.ready)) {
    return undefined;
  }
  const ordered = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const playerIds: [string, string] = [ordered[0]!.userId, ordered[1]!.userId];
  const prev = cloneTable(table);
  const now = Date.now();

  await createArenaGame({
    client,
    tableName,
    gameId: table.tableId,
    metaGame: table.metaGame,
    tcId: table.arenaTcId,
    playerIds,
    variants: table.variants.length > 0 ? table.variants : undefined,
    now,
  });

  await broadcastArenaLaunch({
    metaGame: table.metaGame,
    gameId: table.tableId,
    playerIds,
  });

  table.state = 'playing';
  table.gameStartedAt = now;
  const next = withUpdated(table, now);
  next.indexState = 'playing';
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  return next;
}

export async function setArenaReadyRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
  ready: boolean,
): Promise<{ ok: true; launched?: boolean } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return { error: 'Arena table not found.' };
  }
  if (table.state !== 'seated' && table.state !== 'open') {
    return { error: 'Table is not in lobby state.' };
  }
  const seat = table.seats.find((s) => s.userId === userId);
  if (seat === undefined) {
    return { error: 'You are not seated at this table.' };
  }
  const prev = cloneTable(table);
  seat.ready = ready;
  if (!ready) {
    table.swapProposalUserId = undefined;
  }
  const next = withUpdated(table, Date.now());
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  if (ready) {
    await broadcastArenaTableActivity(next, 'ready', userId);
  }
  if (next.seats.every((s) => s.userId && s.ready)) {
    const launched = await launchArenaTableIfReady(client, tableName, next);
    return { ok: true, launched: launched !== undefined };
  }
  return { ok: true };
}

export async function proposeArenaSeatSwapRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined || table.state !== 'seated') {
    return { error: 'Seat swap is only available when both players are seated.' };
  }
  if (!isSeatedOnTable(table, userId)) {
    return { error: 'You are not seated at this table.' };
  }
  if (table.swapProposalUserId && table.swapProposalUserId !== userId) {
    return { error: 'Respond to your opponent’s seat swap offer first.' };
  }
  if (table.swapProposalUserId === userId) {
    return { error: 'You already offered a seat swap.' };
  }
  const prev = cloneTable(table);
  table.swapProposalUserId = userId;
  table.seats.forEach((s) => { s.ready = false; });
  const next = withUpdated(table, Date.now());
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  return { ok: true };
}

export async function acceptArenaSeatSwapRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined || table.state !== 'seated') {
    return { error: 'Seat swap is not available.' };
  }
  if (!table.swapProposalUserId || table.swapProposalUserId === userId) {
    return { error: 'No pending seat swap from your opponent.' };
  }
  if (!isSeatedOnTable(table, userId)) {
    return { error: 'You are not seated at this table.' };
  }
  const prev = cloneTable(table);
  for (const s of table.seats) {
    s.seatIndex = s.seatIndex === 0 ? 1 : 0;
    s.ready = false;
  }
  table.seats.sort((a, b) => a.seatIndex - b.seatIndex);
  table.swapProposalUserId = undefined;
  const next = withUpdated(table, Date.now());
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  return { ok: true };
}

export async function rejectArenaSeatSwapRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string }> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined || table.state !== 'seated') {
    return { error: 'Seat swap is not available.' };
  }
  if (!table.swapProposalUserId) {
    return { error: 'No pending seat swap.' };
  }
  if (table.swapProposalUserId === userId) {
    return { error: 'Waiting for your opponent to accept or decline the swap.' };
  }
  if (!isSeatedOnTable(table, userId)) {
    return { error: 'You are not seated at this table.' };
  }
  const prev = cloneTable(table);
  table.swapProposalUserId = undefined;
  const next = withUpdated(table, Date.now());
  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);
  return { ok: true };
}

/** Clear playing index and user slots when arena game ends (GAME archived). */
export async function finishArenaTableOnGameEnd(
  client: DynamoDBDocumentClient,
  tableName: string,
  tableId: string,
): Promise<void> {
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return;
  }
  await deleteAllArenaIndexForTable(client, tableName, table);
  for (const uid of seatUserIds(table)) {
    await deleteArenaUserSlot(client, tableName, uid).catch(() => undefined);
  }
  table.state = 'ended';
  await deleteArenaTable(client, tableName, tableId);
}

export async function resolveUserArenaTableId(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string | undefined> {
  return getArenaUserTableId(client, tableName, userId);
}
