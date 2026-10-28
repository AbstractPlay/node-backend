import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  checkInGameCommentAuth,
  gameRecordSk,
  isGameParticipant,
  isSiteAdmin,
  type InGameCommentAuthResult,
} from '../commentAuth.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getArenaTable } from './table/store.js';
import { isSeatedOnTable } from './table/eligibility.js';

async function getGamePlayMode(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  cbit: 0 | 1,
): Promise<{ players: { id: string }[]; playMode?: string } | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: gameRecordSk(metaGame, cbit, gameId) },
  }));
  if (data.Item === undefined) {
    return undefined;
  }
  const game = data.Item as { players?: { id: string }[]; playMode?: string };
  return {
    players: Array.isArray(game.players) ? game.players : [],
    playMode: game.playMode,
  };
}

/**
 * Arena table / game chat (GAMECOMMENTS sk = tableId = gameId).
 * Pre-launch: seated players + spectators. In progress: players only. Post-game arena: kibitz.
 */
export async function checkArenaTableCommentAuth(
  client: DynamoDBDocumentClient,
  tableName: string,
  userid: string,
  metaGame: string,
  tableId: string,
): Promise<InGameCommentAuthResult> {
  if (!userid) {
    return { ok: true };
  }

  const arenaTable = await getArenaTable(client, tableName, tableId);
  if (arenaTable !== undefined) {
    if (arenaTable.state === 'open' || arenaTable.state === 'seated') {
      if (await isSiteAdmin(client, tableName, userid)) {
        return { ok: true };
      }
      return { ok: true };
    }
    if (arenaTable.state === 'playing' || arenaTable.state === 'launching') {
      const active = await getGamePlayMode(client, tableName, metaGame, tableId, 0);
      if (active !== undefined) {
        if (isGameParticipant(active, userid)) {
          return { ok: true };
        }
        if (await isSiteAdmin(client, tableName, userid)) {
          return { ok: true };
        }
        return {
          ok: false,
          message: 'Only game participants and admins can comment during live arena play.',
        };
      }
    }
  }

  const activeGame = await getGamePlayMode(client, tableName, metaGame, tableId, 0);
  if (activeGame !== undefined) {
    if (activeGame.playMode === 'arena') {
      if (isGameParticipant(activeGame, userid)) {
        return { ok: true };
      }
      if (await isSiteAdmin(client, tableName, userid)) {
        return { ok: true };
      }
      return {
        ok: false,
        message: 'Only game participants and admins can comment on active arena games.',
      };
    }
    return checkInGameCommentAuth(client, tableName, userid, metaGame, tableId);
  }

  const completed = await getGamePlayMode(client, tableName, metaGame, tableId, 1);
  if (completed?.playMode === 'arena') {
    if (await isSiteAdmin(client, tableName, userid)) {
      return { ok: true };
    }
    return { ok: true };
  }

  if (arenaTable !== undefined && (arenaTable.state === 'open' || arenaTable.state === 'seated')) {
    if (isSeatedOnTable(arenaTable, userid)) {
      return { ok: true };
    }
    return { ok: true };
  }

  return checkInGameCommentAuth(client, tableName, userid, metaGame, tableId);
}
