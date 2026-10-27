import {
  BatchGetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { isVacationStintLive } from '../vacation/resolve.js';
import type { VacationUserFields } from '../vacation/types.js';
import { createNotification } from '../notifications.js';
import { queryAllItems } from './dynamoPages.js';
import type { LadderPlayerRecord, LadderRecord } from './types.js';

export function utcDayStartMs(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeDecayPoints(points: number, decayRatePerDay: number): number {
  if (points <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(points * (1 - decayRatePerDay)));
}

export type LadderDecayRunResult = {
  playersRead: number;
  decayApplied: number;
  skippedForming: number;
  skippedVacation: number;
  skippedNotIdle: number;
  skippedHasActiveGames: number;
  skippedAlreadyDecayedToday: number;
  skippedZeroPoints: number;
};

async function loadAllLadders(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<Map<string, LadderRecord>> {
  const rows = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': 'LADDER' },
  });
  const map = new Map<string, LadderRecord>();
  for (const row of rows) {
    const ladder = row as LadderRecord;
    if (typeof ladder.sk === 'string') {
      map.set(ladder.sk, ladder);
    }
  }
  return map;
}

function ladderIdFromPlayerSk(sk: string): string {
  const idx = sk.indexOf('#');
  return idx >= 0 ? sk.slice(0, idx) : sk;
}

function isDecayCandidate(
  player: LadderPlayerRecord,
  ladder: LadderRecord,
  now: number,
  dayStart: number,
): { ok: true } | { ok: false; reason: keyof LadderDecayRunResult } {
  if (ladder.status === 'forming') {
    return { ok: false, reason: 'skippedForming' };
  }
  if ((player.activeLadderGameCount ?? 0) > 0) {
    return { ok: false, reason: 'skippedHasActiveGames' };
  }
  const idleMs = ladder.tuning.decayAfterDaysNoActiveLadderGames * 86_400_000;
  if (now - player.lastLadderActivityAt < idleMs) {
    return { ok: false, reason: 'skippedNotIdle' };
  }
  if (player.points <= 0) {
    return { ok: false, reason: 'skippedZeroPoints' };
  }
  const lastDecay = (player as LadderPlayerRecord & { lastDecayAt?: number }).lastDecayAt;
  if (lastDecay !== undefined && lastDecay >= dayStart) {
    return { ok: false, reason: 'skippedAlreadyDecayedToday' };
  }
  return { ok: true };
}

async function batchGetVacationFields(
  client: DynamoDBDocumentClient,
  tableName: string,
  userIds: string[],
): Promise<Map<string, VacationUserFields>> {
  const map = new Map<string, VacationUserFields>();
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(id => ({ pk: 'USER', sk: id })),
          ProjectionExpression: 'sk, vacationStartsAt, vacationStintStartedAt, vacationEndsAt, vacationOpenEnded, vacationPauseMsUsed, vacationQuotaYear',
        },
      },
    }));
    for (const item of data.Responses?.[tableName] ?? []) {
      const id = String(item.sk);
      map.set(id, item as VacationUserFields);
    }
  }
  return map;
}

export async function runLadderDecayPass(
  client: DynamoDBDocumentClient,
  tableName: string,
  now = Date.now(),
): Promise<LadderDecayRunResult> {
  const result: LadderDecayRunResult = {
    playersRead: 0,
    decayApplied: 0,
    skippedForming: 0,
    skippedVacation: 0,
    skippedNotIdle: 0,
    skippedHasActiveGames: 0,
    skippedAlreadyDecayedToday: 0,
    skippedZeroPoints: 0,
  };
  const dayStart = utcDayStartMs(now);
  const ladders = await loadAllLadders(client, tableName);

  const rows = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': 'LADDERPLAYER' },
  });

  const pendingDecay: { player: LadderPlayerRecord; ladder: LadderRecord; after: number }[] = [];

  for (const row of rows) {
    result.playersRead += 1;
    const player = row as LadderPlayerRecord;
    const ladderId = player.ladderId ?? ladderIdFromPlayerSk(player.sk);
    const ladder = ladders.get(ladderId);
    if (ladder === undefined) {
      continue;
    }
    const check = isDecayCandidate(player, ladder, now, dayStart);
    if (!check.ok) {
      const key = check.reason;
      if (key in result && key !== 'playersRead' && key !== 'decayApplied') {
        (result as Record<string, number>)[key] += 1;
      }
      continue;
    }
    pendingDecay.push({
      player,
      ladder,
      after: computeDecayPoints(player.points, ladder.tuning.decayRatePerDay),
    });
  }

  if (pendingDecay.length === 0) {
    return result;
  }

  const vacationByUser = await batchGetVacationFields(
    client,
    tableName,
    [...new Set(pendingDecay.map(p => p.player.userid))],
  );

  for (const { player, ladder, after } of pendingDecay) {
    const vac = vacationByUser.get(player.userid);
    if (vac !== undefined && isVacationStintLive(vac, now)) {
      result.skippedVacation += 1;
      continue;
    }
    const before = player.points;
    if (after === before) {
      result.skippedZeroPoints += 1;
      continue;
    }
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'LADDERPLAYER', sk: player.sk },
      UpdateExpression: 'SET points = :p, lastDecayAt = :d',
      ExpressionAttributeValues: { ':p': after, ':d': now },
    }));
    result.decayApplied += 1;
    try {
      await createNotification(client, tableName, player.userid, {
        type: 'ladderDecay',
        ladderId: ladder.id,
        metaGame: ladder.metaGame,
        variants: [...ladder.variants],
        delta: after - before,
        pointsBefore: before,
        pointsAfter: after,
      });
    } catch (err) {
      console.warn(`ladder decay notification failed for ${player.userid} on ${ladder.id}`, err);
    }
  }

  return result;
}
