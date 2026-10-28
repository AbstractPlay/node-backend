#!/usr/bin/env node
/* eslint-env node */
/**
 * Dev-only: start a 2-player arena game (requires create_arena_dev_game or direct create).
 *
 *   npm run arena-dev-create-game -- --metaGame hex --tcId blitz_5_3 --host USER --opponent USER2
 */
import { parseArgs } from 'node:util';
import { Amplify } from 'aws-amplify';
import { signIn, fetchAuthSession } from 'aws-amplify/auth';
import { createArenaDevGame } from '../lib/arena/createArenaDevGame.ts';

const { values } = parseArgs({
  options: {
    metaGame: { type: 'string' },
    tcId: { type: 'string', default: 'blitz_5_3' },
    host: { type: 'string' },
    opponent: { type: 'string' },
  },
});

async function main() {
  const metaGame = values.metaGame;
  const host = values.host;
  const opponent = values.opponent;
  if (!metaGame || !host || !opponent) {
    console.error('Usage: --metaGame <id> --host <userId> --opponent <userId> [--tcId blitz_5_3]');
    process.exit(1);
  }

  process.env.WEBSOCKET_STAGE ??= 'dev';
  process.env.ABSTRACT_PLAY_TABLE ??= 'abstract-play-dev';
  process.env.ARENA_FLAG_WORKER_ARN ??= process.env.ARENA_FLAG_WORKER_ARN;
  process.env.ARENA_SCHEDULER_ROLE_ARN ??= process.env.ARENA_SCHEDULER_ROLE_ARN;

  if (!process.env.ARENA_FLAG_WORKER_ARN || !process.env.ARENA_SCHEDULER_ROLE_ARN) {
    console.error('Set ARENA_FLAG_WORKER_ARN and ARENA_SCHEDULER_ROLE_ARN (stack outputs) before running locally.');
    process.exit(1);
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: 'us-east-1_2zrzbEjoU',
        userPoolClientId: '14mpql1tmvntup4p2anm4jt782',
      },
    },
  });

  const password = process.env.AP_SMOKE_PASSWORD;
  if (!password) {
    console.error('Set AP_SMOKE_PASSWORD for host sign-in, or call create_arena_dev_game via authQuery.');
    process.exit(1);
  }

  await signIn({ username: host, password });
  const session = await fetchAuthSession();
  const sub = session.tokens?.idToken?.payload?.sub;
  if (typeof sub !== 'string') {
    throw new Error('No sub after sign-in');
  }

  const res = await createArenaDevGame(sub, {
    metaGame,
    tcId: values.tcId ?? 'blitz_5_3',
    opponentId: opponent,
  });
  if (res.statusCode !== 200) {
    console.error(typeof res.body === 'string' ? res.body : res);
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(res.body), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
