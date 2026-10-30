#!/usr/bin/env node
/**
 * Delete one abandoned account (live DDB + Cognito) after eligibility checks.
 *
 * Usage:
 *   npx tsx scripts/abandoned-account-deletion.mjs --stage prod --user-id <sub> --dry-run
 *   npx tsx scripts/abandoned-account-deletion.mjs --stage prod --user-id <sub> --apply
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  inactiveBeforeMsFromEnv,
  runAbandonedAccountDeletionForUser,
} from '../lib/abandonedAccountDeletion.js';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
    feedbackTable: 'abstract-play-feedback-dev',
    userPoolId: 'us-east-1_2zrzbEjoU',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
    feedbackTable: 'abstract-play-feedback-prod',
    userPoolId: 'us-east-1_YCjgSZHJm',
  },
};

function usage() {
  console.error(`Usage: npx tsx scripts/abandoned-account-deletion.mjs --user-id <sub> [--stage dev|prod] [--dry-run|--apply]

Default is --dry-run. --apply performs deletes.
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { stage: 'dev', userId: '', apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--user-id' && argv[i + 1]) {
      args.userId = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!args.userId) {
    usage();
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const stageConfig = STAGES[args.stage];
  if (!stageConfig) {
    throw new Error(`Unknown stage: ${args.stage}`);
  }

  process.env.AWS_PROFILE = stageConfig.profile;
  process.env.ABSTRACT_PLAY_TABLE = stageConfig.table;
  process.env.FEEDBACK_TABLE = stageConfig.feedbackTable;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const inactiveBeforeMs = inactiveBeforeMsFromEnv();
  const dryRun = !args.apply;

  console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'} abandoned account deletion for ${args.userId} (${args.stage})`);

  const result = await runAbandonedAccountDeletionForUser(client, stageConfig.table, args.userId, {
    inactiveBeforeMs,
    userPoolId: stageConfig.userPoolId,
    dryRun,
    feedbackTableName: stageConfig.feedbackTable,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'skipped') {
    process.exit(2);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
