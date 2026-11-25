import type { GameEndKind } from '../gameEndMeta.js';
import { gameEndFieldsFromState } from '../gameEndMeta.js';
import type { LadderPlayerRecord } from './types.js';
import { rankLadderMembers } from './rank.js';

export type LadderGameOutcomeKind = 'win' | 'draw';

/** Snapshot attributes persisted on LADDERGAME at settlement. */
export type LadderGameSnapshotAttrs = {
  outcome: LadderGameOutcomeKind;
  playerIds: [string, string];
  playerNames: [string, string];
  winnerSeat?: number;
  winnerId?: string;
  loserId?: string;
  winnerPointsBefore?: number;
  loserPointsBefore?: number;
  winnerGain?: number;
  loserLoss?: number;
  upset?: boolean;
  winnerRankBefore?: number;
  winnerRankAfter?: number;
  loserRankBefore?: number;
  loserRankAfter?: number;
  gameEndKind?: GameEndKind;
};

export type LadderOutcomePlayer = { id: string; name?: string };

export function playerDisplayName(p: LadderOutcomePlayer): string {
  const name = p.name?.trim();
  return name !== undefined && name.length > 0 ? name : p.id;
}

export function rankMapForLadderPlayers(
  players: LadderPlayerRecord[],
  pointOverrides?: Map<string, number>,
): Map<string, number> {
  const rankable = players.map((p) => ({
    userid: p.userid,
    points: pointOverrides?.get(p.userid) ?? p.points,
    joinedAt: p.joinedAt,
    membershipStatus: p.membershipStatus,
  }));
  return rankLadderMembers(rankable);
}

export type BuildLadderOutcomeSnapshotInput = {
  players: [LadderOutcomePlayer, LadderOutcomePlayer];
  winner?: number[];
  metaGame: string;
  state?: string;
  ladderPlayers: LadderPlayerRecord[];
  winnerPointsBefore?: number;
  loserPointsBefore?: number;
  winnerGain?: number;
  loserLoss?: number;
};

export function buildLadderOutcomeSnapshot(
  input: BuildLadderOutcomeSnapshotInput,
): LadderGameSnapshotAttrs {
  const p0 = input.players[0];
  const p1 = input.players[1];
  const playerIds: [string, string] = [p0.id, p1.id];
  const playerNames: [string, string] = [
    playerDisplayName(p0),
    playerDisplayName(p1),
  ];

  let gameEndKind: GameEndKind | undefined;
  if (input.state !== undefined && input.state !== '') {
    gameEndKind = gameEndFieldsFromState(input.metaGame, input.state)?.gameEndKind;
  }

  if (input.winner === undefined || input.winner.length !== 1) {
    return {
      outcome: 'draw',
      playerIds,
      playerNames,
      winnerGain: 0,
      loserLoss: 0,
      ...(gameEndKind !== undefined ? { gameEndKind } : {}),
    };
  }

  const winnerIndex = input.winner[0]! - 1;
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const winnerId = input.players[winnerIndex]!.id;
  const loserId = input.players[loserIndex]!.id;
  const winnerBefore = input.winnerPointsBefore!;
  const loserBefore = input.loserPointsBefore!;
  const winnerGain = input.winnerGain ?? 0;
  const loserLoss = input.loserLoss ?? 0;
  const winnerAfter = winnerBefore + winnerGain;
  const loserAfter = Math.max(0, loserBefore - loserLoss);

  const ranksBefore = rankMapForLadderPlayers(input.ladderPlayers);
  const afterOverrides = new Map<string, number>([
    [winnerId, winnerAfter],
    [loserId, loserAfter],
  ]);
  const ranksAfter = rankMapForLadderPlayers(input.ladderPlayers, afterOverrides);

  return {
    outcome: 'win',
    playerIds,
    playerNames,
    winnerSeat: input.winner[0],
    winnerId,
    loserId,
    winnerPointsBefore: winnerBefore,
    loserPointsBefore: loserBefore,
    winnerGain,
    loserLoss,
    upset: winnerBefore < loserBefore,
    winnerRankBefore: ranksBefore.get(winnerId),
    winnerRankAfter: ranksAfter.get(winnerId),
    loserRankBefore: ranksBefore.get(loserId),
    loserRankAfter: ranksAfter.get(loserId),
    ...(gameEndKind !== undefined ? { gameEndKind } : {}),
  };
}

export function ladderGameSnapshotUpdateFragments(
  snapshot: LadderGameSnapshotAttrs,
): {
  setClauses: string[];
  expressionAttributeNames: Record<string, string>;
  expressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses: string[] = [];

  const add = (attr: string, value: unknown, placeholder: string) => {
    if (value === undefined) {
      return;
    }
    names[`#${attr}`] = attr;
    values[placeholder] = value;
    setClauses.push(`#${attr} = ${placeholder}`);
  };

  add('outcome', snapshot.outcome, ':outcome');
  add('playerIds', snapshot.playerIds, ':playerIds');
  add('playerNames', snapshot.playerNames, ':playerNames');
  add('winnerSeat', snapshot.winnerSeat, ':winnerSeat');
  add('winnerId', snapshot.winnerId, ':winnerId');
  add('loserId', snapshot.loserId, ':loserId');
  add('winnerPointsBefore', snapshot.winnerPointsBefore, ':wpb');
  add('loserPointsBefore', snapshot.loserPointsBefore, ':lpb');
  add('winnerGain', snapshot.winnerGain, ':wg');
  add('loserLoss', snapshot.loserLoss, ':ll');
  add('upset', snapshot.upset, ':upset');
  add('winnerRankBefore', snapshot.winnerRankBefore, ':wrb');
  add('winnerRankAfter', snapshot.winnerRankAfter, ':wra');
  add('loserRankBefore', snapshot.loserRankBefore, ':lrb');
  add('loserRankAfter', snapshot.loserRankAfter, ':lra');
  add('gameEndKind', snapshot.gameEndKind, ':gek');

  return { setClauses, expressionAttributeNames: names, expressionAttributeValues: values };
}

export function ladderGameRecordHasSnapshot(row: { outcome?: string }): boolean {
  return row.outcome === 'win' || row.outcome === 'draw';
}