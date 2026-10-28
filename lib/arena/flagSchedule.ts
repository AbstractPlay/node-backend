import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import type { ArenaFlagPayload } from './flagPayload.js';
import { ARENA_CLOCK_GRACE_MS } from './constants.js';

export function arenaSchedulerGroupName(stage: string): string {
  return `abstractplay-arena-${stage}`;
}

export function arenaFlagScheduleName(gameId: string): string {
  return `arena-flag-${gameId}`;
}

/** EventBridge Scheduler `at()` expression (UTC, second precision). */
export function formatSchedulerAtExpression(scheduleAtMs: number): string {
  const iso = new Date(scheduleAtMs).toISOString().slice(0, 19);
  return `at(${iso})`;
}

export function computeArenaFlagScheduleAtMs(
  nominalFlagAtMs: number,
  graceMs: number = ARENA_CLOCK_GRACE_MS,
): number {
  return nominalFlagAtMs + graceMs;
}

export type UpsertArenaFlagScheduleInput = {
  stage: string;
  workerArn: string;
  schedulerRoleArn: string;
  payload: ArenaFlagPayload;
  /** Wall time when server would treat bank as zero (before grace). */
  nominalFlagAtMs: number;
  graceMs?: number;
};

export type ArenaFlagScheduleDeps = {
  client: SchedulerClient;
  groupName: string;
  scheduleName: string;
  workerArn: string;
  schedulerRoleArn: string;
};

function buildScheduleParams(
  deps: ArenaFlagScheduleDeps,
  scheduleAtMs: number,
  payload: ArenaFlagPayload,
) {
  return {
    Name: deps.scheduleName,
    GroupName: deps.groupName,
    ScheduleExpression: formatSchedulerAtExpression(scheduleAtMs),
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'OFF' as const },
    ActionAfterCompletion: 'DELETE' as const,
    Target: {
      Arn: deps.workerArn,
      RoleArn: deps.schedulerRoleArn,
      Input: JSON.stringify(payload),
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 3,
      },
    },
  };
}

/** Idempotent — group is not CloudFormation-managed (avoids CI scheduler IAM on deploy). */
export async function ensureArenaSchedulerGroup(
  stage: string,
  client: SchedulerClient = new SchedulerClient({}),
): Promise<void> {
  const Name = arenaSchedulerGroupName(stage);
  try {
    await client.send(new CreateScheduleGroupCommand({ Name }));
  } catch (err) {
    const errName = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (errName === 'ConflictException' || msg.includes('already exists')) {
      return;
    }
    throw err;
  }
}

export async function upsertArenaFlagSchedule(
  input: UpsertArenaFlagScheduleInput,
  client: SchedulerClient = new SchedulerClient({}),
): Promise<void> {
  const groupName = arenaSchedulerGroupName(input.stage);
  await ensureArenaSchedulerGroup(input.stage, client);
  const scheduleName = arenaFlagScheduleName(input.payload.gameId);
  const scheduleAtMs = computeArenaFlagScheduleAtMs(
    input.nominalFlagAtMs,
    input.graceMs,
  );
  const deps: ArenaFlagScheduleDeps = {
    client,
    groupName,
    scheduleName,
    workerArn: input.workerArn,
    schedulerRoleArn: input.schedulerRoleArn,
  };
  const params = buildScheduleParams(deps, scheduleAtMs, input.payload);
  try {
    await client.send(new UpdateScheduleCommand(params));
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      await client.send(new CreateScheduleCommand(params));
      return;
    }
    throw err;
  }
}

export async function deleteArenaFlagSchedule(
  stage: string,
  gameId: string,
  client: SchedulerClient = new SchedulerClient({}),
): Promise<void> {
  const groupName = arenaSchedulerGroupName(stage);
  const scheduleName = arenaFlagScheduleName(gameId);
  try {
    await client.send(new DeleteScheduleCommand({
      Name: scheduleName,
      GroupName: groupName,
    }));
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return;
    }
    throw err;
  }
}
