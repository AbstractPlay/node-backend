#!/usr/bin/env node
/**
 * Point a Cognito user pool Pre sign-up trigger at the deployed cognitoPreSignUp Lambda.
 * Preserves existing LambdaConfig entries (e.g. Custom message).
 *
 * Usage:
 *   npm run apply-cognito-pre-signup-trigger -- --stage dev
 *   npm run apply-cognito-pre-signup-trigger -- --stage dev --dry-run
 */
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AddPermissionCommand,
  GetFunctionCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    userPoolId: 'us-east-1_2zrzbEjoU',
    functionName: 'abstract-play-dev-cognitoPreSignUp',
  },
  prod: {
    profile: 'AbstractPlayProd',
    userPoolId: 'us-east-1_YCjgSZHJm',
    functionName: 'abstract-play-prod-cognitoPreSignUp',
  },
};

function usage() {
  console.error('Usage: npm run apply-cognito-pre-signup-trigger -- --stage dev|prod [--function-arn ARN] [--dry-run]');
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

async function ensureCognitoInvokePermission(
  lambda,
  functionName,
  userPoolArn,
  stage,
) {
  const statementId = `cognito-pre-signup-${stage}`.replace(/[^a-zA-Z0-9-_]/g, '-');
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: statementId,
      Action: 'lambda:InvokeFunction',
      Principal: 'cognito-idp.amazonaws.com',
      SourceArn: userPoolArn,
    }));
    console.log(`Added Lambda invoke permission (${statementId}) for Cognito.`);
  } catch (err) {
    if (err?.name === 'ResourceConflictException') {
      console.log(`Lambda invoke permission already present (${statementId}).`);
      return;
    }
    throw err;
  }
}

async function resolveFunctionArn(lambda, functionName) {
  try {
    const res = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    const arn = res.Configuration?.FunctionArn;
    if (!arn) {
      throw new Error(`Could not resolve ARN for ${functionName}`);
    }
    return arn;
  } catch (err) {
    if (err?.name === 'ResourceNotFoundException') {
      throw new Error(
        `Lambda ${functionName} not found — deploy the API stack first (serverless deploy --stage ${functionName.includes('-dev-') ? 'dev' : 'prod'}), `
          + 'or pass --function-arn.',
      );
    }
    throw err;
  }
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
  if (!pool?.Arn) {
    throw new Error(`User pool ${stageCfg.userPoolId} not found`);
  }

  const existing = pool.LambdaConfig ?? {};
  const nextLambdaConfig = {
    ...existing,
    PreSignUp: functionArn,
  };
  const autoVerifiedAttributes = pool.AutoVerifiedAttributes?.length
    ? pool.AutoVerifiedAttributes
    : ['email'];

  console.log(`Stage: ${args.stage}`);
  console.log(`Pool: ${stageCfg.userPoolId}`);
  console.log(`PreSignUp ARN: ${functionArn}`);
  console.log('Current LambdaConfig:', JSON.stringify(existing, null, 2));
  console.log('AutoVerifiedAttributes:', JSON.stringify(autoVerifiedAttributes));

  if (args.dryRun) {
    console.log('\nDry run — would set LambdaConfig:', JSON.stringify(nextLambdaConfig, null, 2));
    console.log(`Would add invoke permission for pool ${pool.Arn}`);
    return;
  }

  await ensureCognitoInvokePermission(
    lambda,
    stageCfg.functionName,
    pool.Arn,
    args.stage,
  );

  await cognito.send(new UpdateUserPoolCommand({
    UserPoolId: stageCfg.userPoolId,
    LambdaConfig: nextLambdaConfig,
    AutoVerifiedAttributes: autoVerifiedAttributes,
  }));

  console.log('\nUpdateUserPool succeeded (Pre sign-up trigger + preserved LambdaConfig).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});