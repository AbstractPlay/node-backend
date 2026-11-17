#!/usr/bin/env node
/**
 * Delete Cognito users that have no DynamoDB USER row (one-shot / on-demand ops).
 *
 * Input is the audit output from audit-cognito-without-ddb (confirmedNoDdbUser).
 * Re-checks live USER + BOT before each delete. Default --dry-run.
 *
 * Usage:
 *   npm run audit-cognito-without-ddb -- --stage prod --skip-cognito-export
 *   npm run purge-cognito-without-ddb -- --stage prod --dry-run
 *   npm run purge-cognito-without-ddb -- --stage prod --apply
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { deleteHumanCognitoUser } from '../lib/abandonedAccountDeletion.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = join(repoRoot, '.local', 'cognito-orphan-audit', 'confirmed-no-ddb-user.json');
const DEFAULT_WORK = join(repoRoot, '.local', 'cognito-orphan-audit');

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
    userPoolId: 'us-east-1_2zrzbEjoU',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
    userPoolId: 'us-east-1_YCjgSZHJm',
  },
};

function usage() {
  console.error(`Usage: npm run purge-cognito-without-ddb -- [options]

Options:
  --stage prod|dev           (default: prod)
  --from-file <path>         Audit JSON (default: .local/cognito-orphan-audit/confirmed-no-ddb-user.json)
  --dry-run                  Default; log would-delete only
  --apply                    Perform AdminDeleteUser after live re-check
  --no-reconfirm             Skip live USER/BOT GetItem (not recommended)
  --limit <n>                Process at most n candidates (smoke test)
  --sub <uuid>               Single sub only (must appear in input file)
  --log-dir <path>           Purge run logs (default: .local/cognito-orphan-audit)
  --help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    stage: 'prod',
    fromFile: DEFAULT_INPUT,
    apply: false,
    reconfirm: true,
    limit: 0,
    sub: '',
    logDir: DEFAULT_WORK,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--from-file' && argv[i + 1]) {
      args.fromFile = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg === '--no-reconfirm') {
      args.reconfirm = false;
    } else if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (arg === '--sub' && argv[i + 1]) {
      args.sub = argv[++i];
    } else if (arg === '--log-dir' && argv[i + 1]) {
      args.logDir = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  return args;
}

function loadCandidates(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (Array.isArray(raw.confirmedNoDdbUser)) {
    return raw.confirmedNoDdbUser;
  }
  throw new Error('Expected array or { confirmedNoDdbUser: [...] }');
}

async function liveHasUserOrBot(client, tableName, sub) {
  const [user, bot] = await Promise.all([
    client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: sub },
      ProjectionExpression: 'pk',
    })),
    client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'BOT', sk: sub },
      ProjectionExpression: 'pk',
    })),
  ]);
  return {
    hasUser: user.Item !== undefined,
    hasBot: bot.Item !== undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const stage = STAGES[args.stage];
  if (!stage) {
    throw new Error(`Unknown stage: ${args.stage}`);
  }
  process.env.AWS_PROFILE = stage.profile;

  const raw = JSON.parse(await readFile(args.fromFile, 'utf8'));
  let candidates = loadCandidates(raw);
  if (args.sub) {
    candidates = candidates.filter((c) => c.sub === args.sub);
    if (candidates.length === 0) {
      throw new Error(`sub ${args.sub} not in ${args.fromFile}`);
    }
  }
  if (args.limit > 0) {
    candidates = candidates.slice(0, args.limit);
  }

  const dryRun = !args.apply;
  console.log(
    `${dryRun ? 'DRY-RUN' : 'APPLY'} purge Cognito without DDB — ${candidates.length} candidates (${args.stage})`,
  );

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const results = {
    dryRun,
    stage: args.stage,
    fromFile: args.fromFile,
    startedAt: new Date().toISOString(),
    summary: {
      input: candidates.length,
      deleted: 0,
      wouldDelete: 0,
      skippedLiveUser: 0,
      skippedLiveBot: 0,
      errors: 0,
    },
    actions: [],
    errors: [],
  };

  for (const row of candidates) {
    const sub = row.sub;
    if (!sub) {
      results.errors.push({ sub, message: 'missing sub' });
      results.summary.errors += 1;
      continue;
    }
    try {
      if (args.reconfirm) {
        const live = await liveHasUserOrBot(ddb, stage.table, sub);
        if (live.hasUser) {
          results.summary.skippedLiveUser += 1;
          results.actions.push({
            sub,
            username: row.username,
            userStatus: row.userStatus,
            action: 'skip',
            reason: 'live_user_row',
          });
          continue;
        }
        if (live.hasBot) {
          results.summary.skippedLiveBot += 1;
          results.actions.push({
            sub,
            username: row.username,
            userStatus: row.userStatus,
            action: 'skip',
            reason: 'live_bot_row',
          });
          continue;
        }
      }

      await deleteHumanCognitoUser(stage.userPoolId, sub, { dryRun });
      if (dryRun) {
        results.summary.wouldDelete += 1;
        results.actions.push({
          sub,
          username: row.username,
          userStatus: row.userStatus,
          action: 'would_delete',
        });
      } else {
        results.summary.deleted += 1;
        results.actions.push({
          sub,
          username: row.username,
          userStatus: row.userStatus,
          action: 'deleted',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.summary.errors += 1;
      results.errors.push({ sub, message });
      console.error(`error ${sub}: ${message}`);
    }
  }

  results.finishedAt = new Date().toISOString();
  await mkdir(args.logDir, { recursive: true });
  const stamp = results.finishedAt.replace(/[:.]/g, '-');
  const logPath = join(args.logDir, `purge-cognito-${dryRun ? 'dry-run' : 'apply'}-${stamp}.json`);
  await writeFile(logPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(results.summary, null, 2));
  console.log(`Wrote ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});