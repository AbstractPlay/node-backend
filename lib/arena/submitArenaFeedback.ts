import {
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { formatReturnError, headers } from '../api/http.js';
import { isArenaGame } from '../gamePlayMode.js';
import { getArenaTimeControl } from './timeControls.js';
import { arenaFeedbackPk, arenaFeedbackSk } from './arenaFeedbackKeys.js';

const LIKERT_MIN = 1;
const LIKERT_MAX = 5;
const COMMENT_MAX = 500;

type UnfairFlag = 'yes' | 'no' | 'na';
type QueueAgain = 'yes' | 'maybe' | 'no';

export type SubmitArenaFeedbackPars = {
  metaGame?: string;
  gameId?: string;
  clockFairness?: number;
  responsiveness?: number;
  tcFit?: number;
  unfairFlag?: string;
  queueAgain?: string;
  comment?: string;
};

function tableName(): string {
  const name = process.env.ABSTRACT_PLAY_TABLE;
  if (!name) {
    throw new Error('ABSTRACT_PLAY_TABLE is not set');
  }
  return name;
}

function jsonOk(body: Record<string, unknown>) {
  return {
    statusCode: 200,
    body: JSON.stringify(body),
    headers,
  };
}

function likert(value: unknown, label: string): number | { error: string } {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { error: `${label} must be an integer ${LIKERT_MIN}–${LIKERT_MAX}.` };
  }
  if (value < LIKERT_MIN || value > LIKERT_MAX) {
    return { error: `${label} must be ${LIKERT_MIN}–${LIKERT_MAX}.` };
  }
  return value;
}

function unfairFlag(value: unknown): UnfairFlag | { error: string } {
  if (value === 'yes' || value === 'no' || value === 'na') {
    return value;
  }
  return { error: 'unfairFlag must be yes, no, or na.' };
}

function queueAgain(value: unknown): QueueAgain | { error: string } {
  if (value === 'yes' || value === 'maybe' || value === 'no') {
    return value;
  }
  return { error: 'queueAgain must be yes, maybe, or no.' };
}

async function loadArenaGame(metaGame: string, gameId: string) {
  for (const cbit of [0, 1]) {
    const data = await ddbDocClient.send(new GetCommand({
      TableName: tableName(),
      Key: { pk: 'GAME', sk: `${metaGame}#${cbit}#${gameId}` },
    }));
    const item = data.Item;
    if (item && isArenaGame(item)) {
      return item as {
        id: string;
        metaGame: string;
        arenaTcId?: string;
        gameEnded?: number;
        players: { id: string }[];
      };
    }
  }
  return undefined;
}

export async function submitArenaFeedback(userid: string, pars: SubmitArenaFeedbackPars) {
  if (!pars.metaGame || !pars.gameId) {
    return formatReturnError('metaGame and gameId are required.');
  }

  const clockFairness = likert(pars.clockFairness, 'clockFairness');
  if (typeof clockFairness === 'object') {
    return formatReturnError(clockFairness.error);
  }
  const responsiveness = likert(pars.responsiveness, 'responsiveness');
  if (typeof responsiveness === 'object') {
    return formatReturnError(responsiveness.error);
  }
  const tcFit = likert(pars.tcFit, 'tcFit');
  if (typeof tcFit === 'object') {
    return formatReturnError(tcFit.error);
  }
  const unfair = unfairFlag(pars.unfairFlag);
  if (typeof unfair === 'object') {
    return formatReturnError(unfair.error);
  }
  const again = queueAgain(pars.queueAgain);
  if (typeof again === 'object') {
    return formatReturnError(again.error);
  }

  let comment: string | undefined;
  if (pars.comment !== undefined && pars.comment !== '') {
    comment = String(pars.comment).trim().slice(0, COMMENT_MAX);
    if (comment.length === 0) {
      comment = undefined;
    }
  }

  const game = await loadArenaGame(pars.metaGame, pars.gameId);
  if (!game) {
    return formatReturnError('Arena game not found.');
  }
  if (game.gameEnded === undefined) {
    return formatReturnError('Feedback is only accepted after the game ends.');
  }
  if (!game.players.some((p) => p.id === userid)) {
    return formatReturnError('Only seated players may submit arena feedback.');
  }

  const tc = game.arenaTcId ? getArenaTimeControl(game.arenaTcId) : undefined;
  const ts = Date.now();
  const item = {
    pk: arenaFeedbackPk(userid),
    sk: arenaFeedbackSk(pars.metaGame, pars.gameId),
    ts,
    metaGame: pars.metaGame,
    gameId: pars.gameId,
    arenaTcId: game.arenaTcId,
    tier: tc?.tier,
    clockFairness,
    responsiveness,
    tcFit,
    unfairFlag: unfair,
    queueAgain: again,
    ...(comment !== undefined ? { comment } : {}),
    playMode: 'arena' as const,
  };

  try {
    await ddbDocClient.send(new PutCommand({
      TableName: tableName(),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
    return jsonOk({ ok: true });
  } catch (err) {
    if (
      err
      && typeof err === 'object'
      && 'name' in err
      && (err as { name: string }).name === 'ConditionalCheckFailedException'
    ) {
      return jsonOk({ ok: true, duplicate: true });
    }
    throw err;
  }
}
