#!/usr/bin/env node
/**
 * Point Cognito user-pool auth email at Amazon SES (DEVELOPER) using the same
 * From matches lib/sesFromAddress.ts (automated SES + Cognito).
 *
 * Preserves LambdaConfig, AutoVerifiedAttributes, and message templates on UpdateUserPool.
 *
 * Usage:
 *   npm run apply-cognito-pool-ses-email -- --stage prod --dry-run
 *   npm run apply-cognito-pool-ses-email -- --stage prod --apply
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetIdentityVerificationAttributesCommand, SESClient } from '@aws-sdk/client-ses';

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
  console.error(`Usage: npm run apply-cognito-pool-ses-email -- --stage prod|dev [--dry-run|--apply]

  Default: --dry-run.
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { stage: 'prod', apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
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

function accountIdFromArn(arn) {
  const accountId = arn?.split(':')[4];
  if (!accountId) {
    throw new Error(`Could not parse account id from ARN: ${arn}`);
  }
  return accountId;
}

async function resolveSesSourceArn(region, accountId, sesIdentity) {
  const ses = new SESClient({ region });
  const attrs = await ses.send(new GetIdentityVerificationAttributesCommand({
    Identities: [sesIdentity],
  }));
  const status = attrs.VerificationAttributes?.[sesIdentity]?.VerificationStatus;
  if (status !== 'Success') {
    throw new Error(
      `SES identity "${sesIdentity}" is not verified (status: ${status ?? 'missing'}).`,
    );
  }
  return `arn:aws:ses:${region}:${accountId}:identity/${sesIdentity}`;
}

function buildUpdateInput(userPoolId, pool, settings, emailConfig, sourceArn) {
  const admin = pool.AdminCreateUserConfig ?? {};
  const inviteTemplate = admin.InviteMessageTemplate ?? settings.inviteMessageTemplate;
  const verificationTemplate = pool.VerificationMessageTemplate ?? settings.verificationMessageTemplate;

  return {
    UserPoolId: userPoolId,
    EmailConfiguration: {
      EmailSendingAccount: 'DEVELOPER',
      SourceArn: sourceArn,
      From: emailConfig.fromEmailAddress,
    },
    LambdaConfig: pool.LambdaConfig ?? {},
    AutoVerifiedAttributes: pool.AutoVerifiedAttributes?.length
      ? pool.AutoVerifiedAttributes
      : ['email'],
    VerificationMessageTemplate: verificationTemplate,
    AdminCreateUserConfig: {
      AllowAdminCreateUserOnly: admin.AllowAdminCreateUserOnly ?? false,
      InviteMessageTemplate: inviteTemplate,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const stageCfg = STAGES[args.stage];
  const settings = await loadSettings();
  const emailConfig = settings.emailConfiguration;
  if (!emailConfig?.fromEmailAddress || !emailConfig?.sesIdentity) {
    throw new Error('scripts/cognito-pool-auth-settings.json missing emailConfiguration');
  }

  process.env.AWS_PROFILE = stageCfg.profile;
  const region = 'us-east-1';
  process.env.AWS_REGION = region;

  const cognito = new CognitoIdentityProviderClient({});
  const described = await cognito.send(new DescribeUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
  }));
  const pool = described.UserPool;
  if (!pool?.Arn) {
    throw new Error(`User pool ${stageCfg.userPoolId} not found`);
  }

  const accountId = accountIdFromArn(pool.Arn);
  const sourceArn = await resolveSesSourceArn(region, accountId, emailConfig.sesIdentity);

  const updateInput = buildUpdateInput(stageCfg.userPoolId, pool, settings, emailConfig, sourceArn);

  console.log(`Stage: ${args.stage} pool ${stageCfg.userPoolId}`);
  console.log('Current EmailConfiguration:', JSON.stringify(pool.EmailConfiguration ?? {}, null, 2));
  console.log('Planned EmailConfiguration:', JSON.stringify(updateInput.EmailConfiguration, null, 2));
  console.log('Preserving CustomMessage:', updateInput.LambdaConfig?.CustomMessage ?? '(none)');
  console.log('Preserving AutoVerifiedAttributes:', JSON.stringify(updateInput.AutoVerifiedAttributes));

  if (!args.apply) {
    console.log('\nDry run only — pass --apply to push to Cognito.');
    return;
  }

  await cognito.send(new UpdateUserPoolCommand(updateInput));
  console.log('\nUpdateUserPool succeeded (SES auth email + preserved pool settings).');

  const after = await cognito.send(new DescribeUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
  }));
  console.log('EmailConfiguration:', JSON.stringify(after.UserPool?.EmailConfiguration ?? {}, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});