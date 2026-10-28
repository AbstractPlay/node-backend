#!/usr/bin/env node
/* eslint-env node */
/**
 * S0 spike: arm a one-shot EventBridge Scheduler → arenaFlagWorker on dev.
 *
 * Prereq: `serverless deploy --stage dev` with arena scheduler resources.
 *
 *   node scripts/arena-spike-scheduler.mjs --stage dev --delay-sec 30
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
  },
});

const stage = values.stage ?? 'dev';
const delaySec = Math.max(15, Number.parseInt(values['delay-sec'] ?? '30', 10));
const metaGame = values['meta-game'] ?? 'spike';
const gameId = values['game-id'] ?? '00000000-0000-4000-8000-000000000001';
const clockGeneration = Number.parseInt(values['clock-generation'] ?? '1', 10);

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

  const client = new SchedulerClient({});
  await ensureArenaSchedulerGroup(stage, client);

  const nominalFlagAtMs = Date.now() + delaySec * 1000;
  const payload = { metaGame, gameId, clockGeneration };

  await upsertArenaFlagSchedule({
    stage,
    workerArn,
    schedulerRoleArn,
    payload,
    nominalFlagAtMs,
  }, client);

  const scheduleAtMs = nominalFlagAtMs + 750;
  console.log(JSON.stringify({
    ok: true,
    stage,
    groupName: `abstractplay-arena-${stage}`,
    scheduleName: `arena-flag-${gameId}`,
    nominalFlagAtMs,
    scheduleAtMs,
    payload,
    hint: `Watch CloudWatch logs for arenaFlagWorker on ${workerArn} after ~${delaySec}s (+750ms grace)`,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
