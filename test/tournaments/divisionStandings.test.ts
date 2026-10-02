import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareDivisionStandingRows,
  computeDivisionStandings,
  type DivisionStandingGame,
  type DivisionStandingPlayer,
} from '../../lib/tournaments/divisionStandings.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/tournaments');

function p(id: string, name: string, rating: number): DivisionStandingPlayer {
  return { playerid: id, playername: name, rating };
}

function g(player1: string, player2: string, winner: string[]): DivisionStandingGame {
  return { player1, player2, winner };
}

describe('computeDivisionStandings', () => {
  it('picks clear winner by points in a three-player round robin', () => {
    const players = [p('a', 'Alice', 1500), p('b', 'Bob', 1400), p('c', 'Carol', 1300)];
    const games = [
      g('a', 'b', ['a']),
      g('a', 'c', ['a']),
      g('b', 'c', ['b']),
    ];
    const result = computeDivisionStandings(games, players);
    assert.equal(result.winnerId, 'a');
    assert.equal(result.winnerName, 'Alice');
    assert.equal(result.ranked[0]!.playerid, 'a');
    assert.equal(result.ranked[0]!.score, 2);
  });

  it('awards half points for draws', () => {
    const players = [p('a', 'Alice', 1500), p('b', 'Bob', 1400)];
    const games = [g('a', 'b', ['a', 'b'])];
    const result = computeDivisionStandings(games, players);
    assert.equal(result.ranked[0]!.score, 0.5);
    assert.equal(result.ranked[1]!.score, 0.5);
    assert.equal(result.winnerId, 'a');
    assert.equal(result.winnerName, 'Alice');
  });

  it('breaks ties on tiebreak then rating', () => {
    const players = [p('a', 'Alice', 1500), p('b', 'Bob', 1600), p('c', 'Carol', 1400)];
    const games = [
      g('a', 'b', ['a', 'b']),
      g('a', 'c', ['a']),
      g('b', 'c', ['b']),
    ];
    const result = computeDivisionStandings(games, players);
    assert.equal(result.ranked[0]!.score, 1.5);
    assert.equal(result.winnerId, 'b');
    assert.equal(result.winnerName, 'Bob');
  });

  it('keeps first player on full tie per legacy iteration order', () => {
    const players = [p('a', 'Alice', 1500), p('b', 'Bob', 1500)];
    const games = [g('a', 'b', ['a', 'b'])];
    const result = computeDivisionStandings(games, players);
    assert.equal(result.winnerId, 'a');
    assert.equal(compareDivisionStandingRows(result.ranked[0]!, result.ranked[1]!), -1);
  });

  it('matches prod-sampled fixture expectations when fixtures exist', () => {
    let files: string[];
    try {
      files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    if (files.length === 0) {
      return;
    }
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8')) as {
        tournamentId: string;
        division: number;
        games: DivisionStandingGame[];
        players: DivisionStandingPlayer[];
        expected: {
          winnerId: string;
          winnerName: string;
          tiebreakByPlayerId: Record<string, number>;
        };
      };
      const result = computeDivisionStandings(raw.games, raw.players);
      assert.equal(
        result.winnerId,
        raw.expected.winnerId,
        `${file}: winnerId`,
      );
      assert.equal(
        result.winnerName,
        raw.expected.winnerName,
        `${file}: winnerName`,
      );
      for (const row of result.ranked) {
        const expectedTb = raw.expected.tiebreakByPlayerId[row.playerid];
        if (expectedTb === undefined) {
          continue;
        }
        assert.equal(row.tiebreak, expectedTb, `${file}: tiebreak ${row.playerid}`);
      }
    }
  });
});
