#!/usr/bin/env node
/**
 * Apply Cognito user pool sign-in aliases and email/SMS message templates.
 *
 * Source of truth: scripts/cognito-pool-auth-settings.json
 *
 * Usage:
 *   npm run apply-cognito-pool-auth-settings -- --stage prod --dry-run
 *   npm run apply-cognito-pool-auth-settings -- --stage dev --apply
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_PATH = join(repoRoot, 'scripts', 'cognito-pool-auth-settings.json');

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    userPoolId: 'us-east-1_2zrzbEjoU',
  },
  prod: {
    profile: 'AbstractPlayProd',
    userPoolId: 'us-east-1_YCjgSZHJm',
  },
};

function usage() {
  console.error(`Usage: npm run apply-cognito-pool-auth-settings -- --stage prod|dev [--dry-run|--apply]

  Default: --dry-run (prints intended UpdateUserPool payload only).
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { stage: 'prod', apply: false, tryEmailAlias: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg === '--try-email-alias') {
      args.tryEmailAlias = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!STAGES[args.stage]) {
    console.error(`Invalid --stage ${args.stage}`);
    usage();
  }
  return args;
}

async function loadSettings() {
  const raw = await readFile(SETTINGS_PATH, 'utf8');
  return JSON.parse(raw);
}

function buildUpdateInput(userPoolId, settings, described, { tryEmailAlias }) {
  const pool = described.UserPool ?? {};
  const admin = pool.AdminCreateUserConfig ?? {};
  const input = {
    UserPoolId: userPoolId,
    VerificationMessageTemplate: settings.verificationMessageTemplate,
    AdminCreateUserConfig: {
      AllowAdminCreateUserOnly: admin.AllowAdminCreateUserOnly ?? false,
      InviteMessageTemplate: settings.inviteMessageTemplate,
    },
  };
  if (tryEmailAlias && settings.aliasAttributes?.length) {
    input.AliasAttributes = settings.aliasAttributes;
  }
  return input;
}

async function main() {
  const args = parseArgs(process.argv);
  const stageCfg = STAGES[args.stage];
  const settings = await loadSettings();

  process.env.AWS_PROFILE = stageCfg.profile;
  process.env.AWS_REGION = 'us-east-1';

  const client = new CognitoIdentityProviderClient({});
  const described = await client.send(new DescribeUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
  }));

  const updateInput = buildUpdateInput(stageCfg.userPoolId, settings, described, {
    tryEmailAlias: args.tryEmailAlias,
  });

  console.log(`Stage: ${args.stage} pool ${stageCfg.userPoolId}`);
  console.log('Current AliasAttributes:', described.UserPool?.AliasAttributes ?? '(none)');
  console.log('Planned update:', JSON.stringify(updateInput, null, 2));

  if (!args.apply) {
    console.log('\nDry run only — pass --apply to push to Cognito.');
    return;
  }

  await client.send(new UpdateUserPoolCommand(updateInput));
  console.log('\nUpdateUserPool succeeded.');

  const after = await client.send(new DescribeUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
  }));
  const aliasAfter = after.UserPool?.AliasAttributes ?? [];
  console.log('AliasAttributes:', aliasAfter.length ? aliasAfter : '(none)');
  console.log('VerificationMessageTemplate:', JSON.stringify(after.UserPool?.VerificationMessageTemplate, null, 2));

  const wantAlias = args.tryEmailAlias && settings.aliasAttributes?.length;
  if (wantAlias && aliasAfter.length === 0) {
    console.warn(
      '\nWARNING: AliasAttributes were requested but the pool still has none. '
        + 'AWS does not allow enabling sign-in aliases on an existing user pool — '
        + 'create a new pool with AliasAttributes at creation time and migrate users, '
        + 'or add a custom "username reminder" / in-app sign-in flow.',
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});