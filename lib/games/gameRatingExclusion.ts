import {
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { parseGameSk, type GameRecord } from '../gameProjector.js';
import { isArenaGame } from '../gamePlayMode.js';
import { gameRecordSk } from '../commentAuth.js';

export type GamePlayerWithSkip = {
  id: string;
  name: string;
  time?: number;
  settings?: Record<string, unknown>;
  skipRating?: boolean;
};

export type SetGameRatingExclusionResult =
  | { ok: true; game: GameRecord; changedUserIds: string[] }
  | { ok: false; reason: string };

export function applySkipRatingFlags(
  players: GamePlayerWithSkip[],
  userIds: string[],
  mode: 'set' | 'clear',
): { players: GamePlayerWithSkip[]; changedUserIds: string[] } {
  const idSet = new Set(userIds);
  const changedUserIds: string[] = [];
  const next = players.map((p) => {
    if (!idSet.has(p.id)) {
      return p;
    }
    const wantSkip = mode === 'set';
    if (p.skipRating === wantSkip) {
      return p;
    }
    changedUserIds.push(p.id);
    if (wantSkip) {
      return { ...p, skipRating: true };
    }
    const { skipRating: _removed, ...rest } = p;
    void _removed;
    return rest;
  });
  return { players: next, changedUserIds };
}

export function assessGameForRatingExclusion(game: GameRecord): { ok: true } | { ok: false; reason: string } {
  const parsed = parseGameSk(game.sk);
  if (!parsed || parsed.cbit !== '1') {
    return { ok: false, reason: 'Rating exclusion applies to completed games (#1#) only' };
  }
  if (isArenaGame(game)) {
    return { ok: false, reason: 'Arena games are unrated' };
  }
  if (game.rated !== true) {
    return { ok: false, reason: 'Game is not rated' };
  }
  return { ok: true };
}

export function validateExclusionUserIds(
  players: GamePlayerWithSkip[],
  userIds: string[],
): string | null {
  if (userIds.length === 0) {
    return 'userIds must be non-empty';
  }
  const seatIds = new Set(players.map(p => p.id));
  for (const id of userIds) {
    if (!seatIds.has(id)) {
      return `User ${id} is not a player in this game`;
    }
  }
  return null;
}

export async function loadCompletedGameForRatingExclusion(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
): Promise<GameRecord | null> {
  const res = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: gameRecordSk(metaGame, 1, gameId) },
  }));
  return (res.Item as GameRecord | undefined) ?? null;
}

export async function setGameRatingExclusions(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  userIds: string[],
  options: { clear?: boolean; dryRun?: boolean } = {},
): Promise<SetGameRatingExclusionResult> {
  const game = await loadCompletedGameForRatingExclusion(docClient, tableName, metaGame, gameId);
  if (!game) {
    return { ok: false, reason: `No completed game ${metaGame}#1#${gameId}` };
  }

  const gate = assessGameForRatingExclusion(game);
  if (!gate.ok) {
    return gate;
  }

  const idErr = validateExclusionUserIds(game.players as GamePlayerWithSkip[], userIds);
  if (idErr) {
    return { ok: false, reason: idErr };
  }

  const mode = options.clear === true ? 'clear' : 'set';
  const { players, changedUserIds } = applySkipRatingFlags(
    game.players as GamePlayerWithSkip[],
    userIds,
    mode,
  );

  const updated: GameRecord = { ...game, players: players as GameRecord['players'] };
  if (changedUserIds.length === 0) {
    return { ok: true, game: updated, changedUserIds: [] };
  }

  if (options.dryRun === true) {
    return { ok: true, game: updated, changedUserIds };
  }

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: updated,
  }));

  return { ok: true, game: updated, changedUserIds };
}

/** Strip staff rating flags when reopening a false timeout back to active play. */
export function playersWithoutSkipRating<T extends GamePlayerWithSkip>(players: T[]): T[] {
  return players.map((p) => {
    if (p.skipRating !== true) {
      return p;
    }
    const { skipRating: _removed, ...rest } = p;
    void _removed;
    return rest as T;
  });
}
