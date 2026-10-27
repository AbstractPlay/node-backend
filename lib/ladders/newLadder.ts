import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import { formatLadderDisplayName } from './displayName.js';
import { ladderSeriesSk } from './keys.js';
import { getLadderSeriesByKey } from './ladderStore.js';
import { joinLadderMembership } from './membership.js';
import type { LadderRecord, LadderSeriesRecord } from './types.js';
import { DEFAULT_LADDER_TUNING } from './types.js';

const TABLE = () => process.env.ABSTRACT_PLAY_TABLE!;

export type NewLadderResult =
  | { ok: true; ladderId: string; displayName: string }
  | { ok: false; message: string; existingLadderId?: string; seriesKey?: string };

export async function createLadder(
  creatorId: string,
  metaGame: string,
  variants: string[],
): Promise<NewLadderResult> {
  const variantErr = validateChallengeVariantUids(metaGame, variants);
  if (variantErr !== undefined) {
    const parsed = JSON.parse(variantErr.body) as { message: string };
    return { ok: false, message: parsed.message };
  }
  if (!tournamentPlaySupported(metaGame)) {
    return { ok: false, message: `Game ${metaGame} does not support ladders (requires playercount 2)` };
  }

  const seriesKey = ladderSeriesSk(metaGame, variants);
  const existing = await getLadderSeriesByKey(seriesKey);
  if (existing !== undefined) {
    const variantsKey = [...variants].sort().join('|');
    return {
      ok: false,
      message: `There is already a ladder for '${metaGame}#${variantsKey}'`,
      existingLadderId: existing.ladderId,
      seriesKey,
    };
  }

  const ladderId = uuid();
  const now = Date.now();
  const tuning = { ...DEFAULT_LADDER_TUNING };

  const ladder: LadderRecord = {
    pk: 'LADDER',
    sk: ladderId,
    id: ladderId,
    metaGame,
    variants,
    status: 'forming',
    creatorId,
    minActiveMembers: tuning.minActiveMembers,
    activeMemberCount: 0,
    activeMemberIds: [],
    everActivated: false,
    dateCreated: now,
    tuning,
  };

  const series: LadderSeriesRecord = {
    pk: 'LADDERSERIES',
    sk: seriesKey,
    ladderId,
  };

  try {
    await ddbDocClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE(),
            Item: series,
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: TABLE(),
            Item: ladder,
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
    }));
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
      const again = await getLadderSeriesByKey(seriesKey);
      if (again !== undefined) {
        const variantsKey = [...variants].sort().join('|');
        return {
          ok: false,
          message: `There is already a ladder for '${metaGame}#${variantsKey}'`,
          existingLadderId: again.ladderId,
          seriesKey,
        };
      }
    }
    throw err;
  }

  const join = await joinLadderMembership(ladderId, creatorId);
  if (!join.ok) {
    return { ok: false, message: join.message };
  }

  return {
    ok: true,
    ladderId,
    displayName: formatLadderDisplayName(metaGame, variants),
  };
}
