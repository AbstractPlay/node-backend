#!/usr/bin/env node
/* eslint-env node */
/**
 * Calculate new two-player ratings after a rated game (same formula as the backend).
 *
 * Usage:
 *   npm run build-ts
 *   node bin/calc-rating.mjs <rating1> <rating2> <result> [--n1 N] [--n2 N]
 *
 * Arguments:
 *   rating1, rating2   Current ratings for player 1 and player 2
 *   result             Player 1 win: 1 | win1 | p1
 *                      Player 2 win: 2 | win2 | p2
 *                      Draw: draw | 0.5
 *
 * Options:
 *   --n1 N             Player 1 rated-game count (default: 0)
 *   --n2 N             Player 2 rated-game count (default: 0)
 *   --json             Output JSON instead of a short summary
 *   --help, -h         Show help
 *
 * Examples:
 *   node bin/calc-rating.mjs 1500 1400 1
 *   node bin/calc-rating.mjs 1500 1400 draw --n1 15 --n2 5
 */
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RATINGS_LIB = path.join(__dirname, '..', 'lib', 'ratings.js');

function usage() {
  console.error(`Usage: node bin/calc-rating.mjs <rating1> <rating2> <result> [--n1 N] [--n2 N] [--json]

Calculate new ratings using the backend Elo formula (K depends on each player's N).

result:
  1, win1, p1     player 1 wins
  2, win2, p2     player 2 wins
  draw, 0.5       draw

Prerequisites:
  npm run build-ts   (compiles lib/ratings.ts to lib/ratings.js)
`);
  process.exit(1);
}

function ensureCompiledLib() {
  if (!existsSync(RATINGS_LIB)) {
    console.error('Missing compiled lib/ratings.js — run: npm run build-ts');
    process.exit(1);
  }
}

function parseResult(value) {
  const normalized = String(value).toLowerCase();
  if (normalized === '1' || normalized === 'win1' || normalized === 'p1') {
    return 1;
  }
  if (normalized === '2' || normalized === 'win2' || normalized === 'p2') {
    return 2;
  }
  if (normalized === 'draw' || normalized === '0.5') {
    return 'draw';
  }
  console.error(`Invalid result "${value}". Use 1, 2, draw, win1, win2, p1, or p2.`);
  process.exit(1);
}

function parseArgs(argv) {
  let rating1;
  let rating2;
  let result;
  let n1 = 0;
  let n2 = 0;
  let json = false;
  const positional = [];

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--n1' && argv[i + 1]) {
      n1 = Number(argv[++i]);
    } else if (arg === '--n2' && argv[i + 1]) {
      n2 = Number(argv[++i]);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (positional.length !== 3) {
    usage();
  }

  rating1 = Number(positional[0]);
  rating2 = Number(positional[1]);
  result = parseResult(positional[2]);

  if (!Number.isFinite(rating1) || !Number.isFinite(rating2)) {
    console.error('rating1 and rating2 must be numbers.');
    process.exit(1);
  }
  if (!Number.isInteger(n1) || n1 < 0 || !Number.isInteger(n2) || n2 < 0) {
    console.error('--n1 and --n2 must be non-negative integers.');
    process.exit(1);
  }

  return { rating1, rating2, result, n1, n2, json };
}

function main() {
  ensureCompiledLib();
  const {
    DEFAULT_PLAYER_RATING,
    expectedScorePlayer1,
    getRatingK,
    player1ScoreFromResult,
    updateTwoPlayerRatings,
  } = require('../lib/ratings.js');

  const { rating1, rating2, result, n1, n2, json } = parseArgs(process.argv);

  const p1 = { ...DEFAULT_PLAYER_RATING, rating: rating1, N: n1 };
  const p2 = { ...DEFAULT_PLAYER_RATING, rating: rating2, N: n2 };
  const player1Score = player1ScoreFromResult(result);
  const expected = expectedScorePlayer1(rating1, rating2);
  const [newP1, newP2] = updateTwoPlayerRatings(p1, p2, player1Score);

  if (json) {
    console.log(JSON.stringify({
      input: {
        player1: { rating: rating1, N: n1, K: getRatingK(n1) },
        player2: { rating: rating2, N: n2, K: getRatingK(n2) },
        result,
        player1Score,
        expectedScorePlayer1: expected,
      },
      output: {
        player1: newP1,
        player2: newP2,
      },
    }, null, 2));
    return;
  }

  console.log(`Expected score (player 1): ${expected.toFixed(4)}`);
  console.log(`K factors: player 1 = ${getRatingK(n1)}, player 2 = ${getRatingK(n2)}`);
  console.log(`Player 1: ${rating1} → ${newP1.rating.toFixed(2)} (Δ ${(newP1.rating - rating1).toFixed(2)})`);
  console.log(`Player 2: ${rating2} → ${newP2.rating.toFixed(2)} (Δ ${(newP2.rating - rating2).toFixed(2)})`);
}

main();
