#!/usr/bin/env node
/* eslint-env node */
/**
 * S0 spike: arm a one-shot EventBridge Scheduler → arenaFlagWorker on dev.
 *
 * Prereq: `serverless deploy --stage dev` with arena scheduler resources.
 *
 *   npm run arena-spike-scheduler -- --stage dev --delay-sec 30
 *   npm run arena-spike-scheduler -- --stage dev --delay-sec 30 --no-wait
 *
 * By default **waits** until the scheduled fire time (+ buffer), then prints how to
 * confirm CloudWatch. The schedule itself is async; this script only blocks if --wait.
 *
 * Env (optional): AWS_PROFILE=AbstractPlayDev
 *   ARENA_FLAG_WORKER_ARN, ARENA_SCHEDULER_ROLE_ARN — else read from stack outputs
 */
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { parseArgs } from 'node:util';
import { ARENA_CLOCK_GRACE_MS } from '../lib/arena/constants.js';
import {
  ensureArenaSchedulerGroup,
  upsertArenaFlagSchedule,
} from '../lib/arena/flagSchedule.js';

const SERVICE = 'abstract-play';

const { values } = parseArgs({
  options: {
    stage: { type: 'string', default: 'dev' },
    'delay-sec': { type: 'string', default: '30' },
    'meta-game': { type: 'string', default: 'spike' },
    'game-id': { type: 'string', default: '00000000-0000-4000-8000-000000000001' },
    'clock-generation': { type: 'string', default: '1' },
    'no-wait': { type: 'boolean', default: false },
  },
});

const stage = values.stage ?? 'dev';
const delaySec = Math.max(15, Number.parseInt(values['delay-sec'] ?? '30', 10));
const metaGame = values['meta-game'] ?? 'spike';
const gameId = values['game-id'] ?? '00000000-0000-4000-8000-000000000001';
const clockGeneration = Number.parseInt(values['clock-generation'] ?? '1', 10);
const shouldWait = values['no-wait'] !== true;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function lambdaNameFromArn(arn) {
  const part = arn.split(':').pop();
  return part ?? arn;
}

async function stackOutput(name) {
  const cfn = new CloudFormationClient({});
  const stacks = await cfn.send(new DescribeStacksCommand({
    StackName: `${SERVICE}-${stage}`,
  }));
  const outputs = stacks.Stacks?.[0]?.Outputs ?? [];
  const hit = outputs.find((o) => o.OutputKey === name);
  if (!hit?.OutputValue) {
    throw new Error(`Missing stack output ${name} on ${SERVICE}-${stage}`);
  }
  return hit.OutputValue;
}

async function main() {
  const workerArn = process.env.ARENA_FLAG_WORKER_ARN
    ?? await stackOutput('ArenaFlagWorkerArn');
  const schedulerRoleArn = process.env.ARENA_SCHEDULER_ROLE_ARN
    ?? await stackOutput('ArenaSchedulerRoleArn');
  const lambdaName = lambdaNameFromArn(workerArn);
  const logGroup = `/aws/lambda/${lambdaName}`;

  const client = new SchedulerClient({});
  await ensureArenaSchedulerGroup(stage, client);

  const armedAtMs = Date.now();
  const nominalFlagAtMs = armedAtMs + delaySec * 1000;
  const scheduleAtMs = nominalFlagAtMs + ARENA_CLOCK_GRACE_MS;
  const payload = { metaGame, gameId, clockGeneration };

  await upsertArenaFlagSchedule({
    stage,
    workerArn,
    schedulerRoleArn,
    payload,
    nominalFlagAtMs,
  }, client);

  console.log(JSON.stringify({
    ok: true,
    stage,
    groupName: `abstractplay-arena-${stage}`,
    scheduleName: `arena-flag-${gameId}`,
    armedAt: new Date(armedAtMs).toISOString(),
    nominalFlagAt: new Date(nominalFlagAtMs).toISOString(),
    schedulerFireAt: new Date(scheduleAtMs).toISOString(),
    payload,
    wait: shouldWait,
  }));

  if (!shouldWait) {
    console.log(
      `Schedule armed (exits immediately). Worker should run ~${delaySec}s + ${ARENA_CLOCK_GRACE_MS}ms grace.`,
    );
    console.log(`CloudWatch log group: ${logGroup}`);
    console.log(
      `  aws logs tail ${logGroup} --since 5m --format short`,
    );
    return;
  }

  const bufferMs = 5000;
  const wakeAtMs = scheduleAtMs + bufferMs;
  const waitMs = Math.max(0, wakeAtMs - Date.now());
  console.log(
    `Waiting ${Math.round(waitMs / 1000)}s for Scheduler → Lambda (fire ~${new Date(scheduleAtMs).toISOString()}, +${bufferMs / 1000}s buffer)…`,
  );
  await sleep(waitMs);

  console.log('Wait complete. Expected log line contains "arenaFlagWorker" (noop game_not_found for spike game id).');
  console.log(`  aws logs tail ${logGroup} --since 10m --format short --filter-pattern arenaFlagWorker`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
