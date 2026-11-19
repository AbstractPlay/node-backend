#!/usr/bin/env node
/**
 * Set REST API stage-wide throttling (MethodSettings for all routes).
 * Serverless deploy does not persist these; run after each API stack deploy (CI).
 *
 * Limits must match serverless.yml custom.apiGatewayStageThrottle.
 *
 * Usage:
 *   npm run apply-api-gateway-stage-throttle -- --stage prod
 *   npm run apply-api-gateway-stage-throttle -- --stage prod --dry-run
 */
import {
  APIGatewayClient,
  GetRestApisCommand,
  GetStageCommand,
  UpdateStageCommand,
} from '@aws-sdk/client-api-gateway';

/** @type {Record<string, { restApiName: string, rateLimit: number, burstLimit: number } | null>} */
const STAGE_THROTTLE = {
  prod: {
    restApiName: 'prod-abstract-play',
    rateLimit: 25,
    burstLimit: 75,
  },
  dev: null,
};

const STAGE_PROFILE = {
  dev: 'AbstractPlayDev',
  prod: 'AbstractPlayProd',
};

function usage() {
  console.error(
    'Usage: npm run apply-api-gateway-stage-throttle -- --stage dev|prod [--dry-run]',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { stage: 'prod', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!Object.hasOwn(STAGE_THROTTLE, args.stage)) {
    console.error(`Invalid --stage ${args.stage}`);
    usage();
  }
  return args;
}

async function resolveRestApiId(client, restApiName) {
  let position;
  do {
    const res = await client.send(
      new GetRestApisCommand({ limit: 500, position }),
    );
    const match = (res.items ?? []).find((api) => api.name === restApiName);
    if (match?.id) {
      return match.id;
    }
    position = res.position;
  } while (position);
  throw new Error(`REST API not found: ${restApiName}`);
}

export async function applyApiGatewayStageThrottle(args, deps = {}) {
  const config = STAGE_THROTTLE[args.stage];
  if (!config) {
    console.log(`apply-api-gateway-stage-throttle: skip ${args.stage} (no throttle config)`);
    return;
  }

  const profile = STAGE_PROFILE[args.stage];
  const client =
    deps.client ??
    new APIGatewayClient({
      region: 'us-east-1',
      ...(profile ? { profile } : {}),
    });

  const restApiId = deps.restApiId ?? (await resolveRestApiId(client, config.restApiName));
  const stageName = args.stage;

  const before = await client.send(
    new GetStageCommand({ restApiId, stageName }),
  );
  const settings = before.methodSettings?.['*/*'] ?? {};
  console.log('Current */* throttle:', {
    rateLimit: settings.throttlingRateLimit,
    burstLimit: settings.throttlingBurstLimit,
  });
  console.log('Target */* throttle:', {
    rateLimit: config.rateLimit,
    burstLimit: config.burstLimit,
  });

  const patchOperations = [
    {
      op: 'replace',
      path: '/*/*/throttling/rateLimit',
      value: String(config.rateLimit),
    },
    {
      op: 'replace',
      path: '/*/*/throttling/burstLimit',
      value: String(config.burstLimit),
    },
  ];

  if (args.dryRun) {
    console.log('dry-run: would UpdateStage', { restApiId, stageName, patchOperations });
    return;
  }

  await client.send(
    new UpdateStageCommand({
      restApiId,
      stageName,
      patchOperations,
    }),
  );
  console.log('apply-api-gateway-stage-throttle ok', {
    stage: args.stage,
    restApiId,
    rateLimit: config.rateLimit,
    burstLimit: config.burstLimit,
  });
}

const isMain = import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  const args = parseArgs(process.argv);
  applyApiGatewayStageThrottle(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}