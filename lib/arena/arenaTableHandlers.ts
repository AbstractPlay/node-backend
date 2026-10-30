import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { formatReturnError, headers } from '../api/http.js';
import { getArenaTable } from './table/store.js';
import { isSeatedOnTable, seatUserIds } from './table/eligibility.js';
import {
  acceptArenaSeatSwapRecord,
  cancelArenaTableRecord,
  createArenaTableRecord,
  joinArenaTableRecord,
  leaveArenaTableRecord,
  proposeArenaSeatSwapRecord,
  rejectArenaSeatSwapRecord,
  setArenaReadyRecord,
  resolveUserArenaTableId,
} from './table/tableMutations.js';
import { listArenaTablesFromIndex } from './table/listTables.js';
import { recordArenaPlayReady } from './arenaSyncStart.js';
import {
  rollbackArenaLaunchToLobby,
  standDownArenaPlayReady,
} from './arenaLaunchSync.js';
import type { ArenaTableListItem, ArenaTableRecord } from './table/types.js';

function tableName(): string {
  const name = process.env.ABSTRACT_PLAY_TABLE;
  if (!name) {
    throw new Error('ABSTRACT_PLAY_TABLE is not set');
  }
  return name;
}

async function loadTableComments(tableId: string) {
  const data = await ddbDocClient.send(new GetCommand({
    TableName: tableName(),
    Key: { pk: 'GAMECOMMENTS', sk: tableId },
  }));
  const raw = data.Item?.comments;
  return Array.isArray(raw) ? raw : [];
}

function serializeTable(
  table: ArenaTableRecord,
  viewerId: string,
  comments: unknown[],
) {
  return {
    tableId: table.tableId,
    state: table.state,
    metaGame: table.metaGame,
    variants: table.variants,
    arenaTcId: table.arenaTcId,
    arenaClock: table.arenaClock,
    open: table.open,
    inviteUserId: table.inviteUserId,
    hostId: table.hostId,
    seats: table.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId || undefined,
      ready: s.ready,
    })),
    swapProposalUserId: table.swapProposalUserId,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
    gameStartedAt: table.gameStartedAt,
    comments,
    viewer: {
      seated: isSeatedOnTable(table, viewerId),
      isHost: table.hostId === viewerId,
    },
  };
}

function jsonOk(body: unknown) {
  return { statusCode: 200, body: JSON.stringify(body), headers };
}

export async function handleCreateArenaTable(
  userid: string,
  pars: {
    metaGame?: string;
    arenaTcId?: string;
    variants?: string[];
    open?: boolean;
    inviteUserId?: string;
  },
) {
  if (!pars.metaGame || !pars.arenaTcId) {
    return formatReturnError('metaGame and arenaTcId are required.');
  }
  const result = await createArenaTableRecord(ddbDocClient, tableName(), userid, {
    metaGame: pars.metaGame,
    arenaTcId: pars.arenaTcId,
    variants: pars.variants,
    open: pars.open,
    inviteUserId: pars.inviteUserId,
  });
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ tableId: result.tableId });
}

export async function handleJoinArenaTable(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await joinArenaTableRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function handleLeaveArenaTable(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await leaveArenaTableRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function handleCancelArenaTable(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await cancelArenaTableRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

function tableRecordToListItem(table: ArenaTableRecord): ArenaTableListItem {
  return {
    tableId: table.tableId,
    metaGame: table.metaGame,
    variants: [...table.variants],
    arenaTcId: table.arenaTcId,
    open: table.open,
    hostId: table.hostId,
    ...(table.inviteUserId ? { inviteUserId: table.inviteUserId } : {}),
    seatUserIds: seatUserIds(table),
    updatedAt: table.updatedAt,
    ...(table.gameStartedAt !== undefined ? { gameStartedAt: table.gameStartedAt } : {}),
    state: table.indexState,
  };
}

export async function handleGetMyArenaTable(userid: string) {
  const tableId = await resolveUserArenaTableId(ddbDocClient, tableName(), userid);
  if (tableId === undefined) {
    return jsonOk({ table: null });
  }
  const table = await getArenaTable(ddbDocClient, tableName(), tableId);
  if (table === undefined) {
    return jsonOk({ table: null });
  }
  return jsonOk({ table: tableRecordToListItem(table) });
}

export async function handleGetArenaTable(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const table = await getArenaTable(ddbDocClient, tableName(), pars.tableId);
  if (table === undefined) {
    return formatReturnError('Arena table not found.');
  }
  const comments = await loadTableComments(pars.tableId);
  return jsonOk(serializeTable(table, userid, comments));
}

export async function handleSetArenaReady(
  userid: string,
  pars: { tableId?: string; ready?: boolean },
) {
  if (!pars.tableId || pars.ready === undefined) {
    return formatReturnError('tableId and ready are required.');
  }
  const result = await setArenaReadyRecord(
    ddbDocClient,
    tableName(),
    userid,
    pars.tableId,
    pars.ready === true,
  );
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true, launched: result.launched === true });
}

export async function handleArenaPlayReady(
  userid: string,
  pars: { metaGame?: string; id?: string },
) {
  if (!pars.metaGame || !pars.id) {
    return formatReturnError('metaGame and id are required.');
  }
  const result = await recordArenaPlayReady(
    ddbDocClient,
    tableName(),
    userid,
    pars.metaGame,
    pars.id,
  );
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  if (result.waitingForOpponent) {
    return jsonOk({ ok: true, waitingForOpponent: true });
  }
  return jsonOk({
    ok: true,
    waitingForOpponent: false,
    arenaClockStartAt: result.arenaClockStartAt,
    serverTime: result.serverTime,
  });
}

export async function handleArenaPlayStandDown(
  userid: string,
  pars: { metaGame?: string; id?: string },
) {
  if (!pars.metaGame || !pars.id) {
    return formatReturnError('metaGame and id are required.');
  }
  const result = await standDownArenaPlayReady(
    ddbDocClient,
    userid,
    pars.metaGame,
    pars.id,
  );
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function handleAbortArenaLaunchSync(
  userid: string,
  pars: { tableId?: string },
) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await rollbackArenaLaunchToLobby(
    ddbDocClient,
    userid,
    pars.tableId,
  );
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true, metaGame: result.metaGame });
}

export async function handleProposeArenaSeatSwap(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await proposeArenaSeatSwapRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function handleAcceptArenaSeatSwap(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await acceptArenaSeatSwapRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function handleRejectArenaSeatSwap(userid: string, pars: { tableId?: string }) {
  if (!pars.tableId) {
    return formatReturnError('tableId is required.');
  }
  const result = await rejectArenaSeatSwapRecord(ddbDocClient, tableName(), userid, pars.tableId);
  if ('error' in result) {
    return formatReturnError(result.error);
  }
  return jsonOk({ ok: true });
}

export async function listArenaTablesPublic(pars: { metaGame?: string; limit?: number }) {
  const { tables } = await listArenaTablesFromIndex(ddbDocClient, tableName(), {
    metaGame: pars.metaGame,
    limit: pars.limit,
  });
  return {
    statusCode: 200,
    body: JSON.stringify({ tables }),
    headers,
  };
}
