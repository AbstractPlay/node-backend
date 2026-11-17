#!/usr/bin/env node
/**
 * Point a Cognito user pool Custom message trigger at the deployed cognitoCustomMessage Lambda.
 *
 * Usage:
 *   npm run apply-cognito-custom-message-trigger -- --stage dev
 *   npm run apply-cognito-custom-message-trigger -- --stage dev --function-arn arn:aws:lambda:...
 *
 * Default: resolve function name abstract-play-<stage>-cognitoCustomMessage in us-east-1.
 */
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  GetFunctionCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    userPoolId: 'us-east-1_2zrzbEjoU',
    functionName: 'abstract-play-dev-cognitoCustomMessage',
  },
  prod: {
    profile: 'AbstractPlayProd',
    userPoolId: 'us-east-1_YCjgSZHJm',
    functionName: 'abstract-play-prod-cognitoCustomMessage',
  },
};

function usage() {
  console.error(`Usage: npm run apply-cognito-custom-message-trigger -- --stage dev|prod [--function-arn ARN] [--dry-run]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { stage: 'dev', functionArn: '', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--function-arn' && argv[i + 1]) {
      args.functionArn = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
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

async function resolveFunctionArn(lambda, functionName) {
  const res = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
  const arn = res.Configuration?.FunctionArn;
  if (!arn) {
    throw new Error(`Could not resolve ARN for ${functionName}`);
  }
  return arn;
}

async function main() {
  const args = parseArgs(process.argv);
  const stageCfg = STAGES[args.stage];

  process.env.AWS_PROFILE = stageCfg.profile;
  process.env.AWS_REGION = 'us-east-1';

  const lambda = new LambdaClient({});
  const cognito = new CognitoIdentityProviderClient({});

  const functionArn = args.functionArn
    || await resolveFunctionArn(lambda, stageCfg.functionName);

  const described = await cognito.send(new DescribeUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
  }));
  const pool = described.UserPool;
  if (!pool) {
    throw new Error(`User pool ${stageCfg.userPoolId} not found`);
  }

  const existing = pool.LambdaConfig ?? {};
  const nextLambdaConfig = {
    ...existing,
    CustomMessage: functionArn,
  };

  console.log(`Stage: ${args.stage}`);
  console.log(`Pool: ${stageCfg.userPoolId}`);
  console.log(`CustomMessage ARN: ${functionArn}`);
  console.log('Current LambdaConfig:', JSON.stringify(existing, null, 2));

  if (args.dryRun) {
    console.log('\nDry run — would set LambdaConfig:', JSON.stringify(nextLambdaConfig, null, 2));
    return;
  }

  await cognito.send(new UpdateUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
    LambdaConfig: nextLambdaConfig,
  }));

  console.log('\nUpdateUserPool succeeded (Custom message trigger).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});