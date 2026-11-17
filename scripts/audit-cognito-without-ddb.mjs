#!/usr/bin/env node
/**
 * Find Cognito pool users (sub) with no matching USER row in DynamoDB.
 *
 * 1. Export Cognito (username, sub, create date)
 * 2. Optional: latest ION dump → set of USER.sk
 * 3. Local: Cognito accounts older than N days not in dump USER set
 * 4. Live BatchGet USER (+ BOT exclude) on subset
 * 5. Write confirmed list JSON under .local/ (gitignored)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  downloadLatestIonDump,
  iterateIonDumpItems,
  resolveIonGzipPaths,
} from './lib/ion-dump-reader.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORK = join(repoRoot, '.local', 'cognito-orphan-audit');
const DEFAULT_ION_CACHE = join(repoRoot, '.local', 'ion-dump');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  console.error(`Usage: npm run audit-cognito-without-ddb -- [options]

Options:
  --stage prod|dev              (default: prod)
  --work-dir <path>             Default: ${DEFAULT_WORK}
  --min-age-days <n>            Cognito UserCreateDate older than N days (default: 30)
  --download-dump               Download latest ION export to .local/ion-dump
  --ion-cache-dir <path>        ION cache (default: ${DEFAULT_ION_CACHE})
  --dump-dir <path>             Use existing export data/ (skip download)
  --skip-cognito-export         Reuse work-dir/cognito-users.json
  --skip-live-confirm           Dump diff only (no DynamoDB reads)
  --out <path>                  Final JSON (default: work-dir/confirmed-no-ddb-user.json)
  --help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    stage: 'prod',
    workDir: DEFAULT_WORK,
    minAgeDays: 30,
    downloadDump: false,
    ionCacheDir: DEFAULT_ION_CACHE,
    dumpDir: '',
    skipCognitoExport: false,
    skipLiveConfirm: false,
    out: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--work-dir' && argv[i + 1]) {
      args.workDir = argv[++i];
    } else if (arg === '--min-age-days' && argv[i + 1]) {
      args.minAgeDays = Number(argv[++i]);
    } else if (arg === '--download-dump') {
      args.downloadDump = true;
    } else if (arg === '--ion-cache-dir' && argv[i + 1]) {
      args.ionCacheDir = argv[++i];
    } else if (arg === '--dump-dir' && argv[i + 1]) {
      args.dumpDir = argv[++i];
    } else if (arg === '--skip-cognito-export') {
      args.skipCognitoExport = true;
    } else if (arg === '--skip-live-confirm') {
      args.skipLiveConfirm = true;
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!args.out) {
    args.out = join(args.workDir, 'confirmed-no-ddb-user.json');
  }
  return args;
}

function cognitoAttr(user, name) {
  return user.Attributes?.find((a) => a.Name === name)?.Value;
}

async function exportCognitoUsers(userPoolId) {
  const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });
  const users = [];
  let paginationToken;
  let pages = 0;
  do {
    const res = await client.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      PaginationToken: paginationToken,
      Limit: 60,
    }));
    pages += 1;
    for (const u of res.Users ?? []) {
      const sub = cognitoAttr(u, 'sub');
      if (!sub) {
        continue;
      }
      users.push({
        sub,
        username: u.Username,
        userStatus: u.UserStatus,
        userCreateDate: u.UserCreateDate?.toISOString() ?? null,
        enabled: u.Enabled,
      });
    }
    paginationToken = res.PaginationToken;
    if (pages % 50 === 0) {
      console.log(`Cognito export: ${users.length} users (${pages} pages)...`);
    }
  } while (paginationToken);
  return users;
}

async function collectUserIdsFromDump(gzipPaths) {
  const userIds = new Set();
  let userRows = 0;
  await iterateIonDumpItems(gzipPaths, (item) => {
    if (item.pk === 'USER' && typeof item.sk === 'string') {
      userIds.add(item.sk);
      userRows += 1;
    }
  });
  console.log(`Dump: ${userRows} USER rows → ${userIds.size} distinct subs`);
  return userIds;
}

function filterCognitoMissingInDump(cognitoUsers, dumpUserIds, minAgeMs, nowMs) {
  const missing = [];
  let tooYoung = 0;
  for (const u of cognitoUsers) {
    const created = u.userCreateDate ? Date.parse(u.userCreateDate) : NaN;
    if (!Number.isFinite(created) || nowMs - created < minAgeMs) {
      tooYoung += 1;
      continue;
    }
    if (!dumpUserIds.has(u.sub)) {
      missing.push(u);
    }
  }
  return { missing, tooYoung };
}

async function batchKeysExist(client, tableName, pk, ids) {
  const found = new Set();
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let request = {
      RequestItems: {
        [tableName]: {
          Keys: chunk.map((sk) => ({ pk, sk })),
          ProjectionExpression: 'pk, sk',
        },
      },
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await client.send(new BatchGetCommand(request));
      for (const item of res.Responses?.[tableName] ?? []) {
        found.add(String(item.sk));
      }
      const unprocessed = res.UnprocessedKeys?.[tableName];
      if (!unprocessed?.Keys?.length) {
        break;
      }
      request = { RequestItems: { [tableName]: unprocessed } };
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return found;
}

async function liveConfirm(client, tableName, candidates) {
  const subs = candidates.map((c) => c.sub);
  const userFound = await batchKeysExist(client, tableName, 'USER', subs);
  const botFound = await batchKeysExist(client, tableName, 'BOT', subs);

  const confirmed = [];
  const excluded = [];
  for (const c of candidates) {
    if (userFound.has(c.sub)) {
      excluded.push({ ...c, reason: 'live_user_row' });
      continue;
    }
    if (botFound.has(c.sub)) {
      excluded.push({ ...c, reason: 'bot_row' });
      continue;
    }
    confirmed.push({
      ...c,
      liveUserRow: false,
      liveBotRow: false,
    });
  }
  return { confirmed, excluded };
}

async function resolveDumpPaths(args) {
  if (args.dumpDir) {
    const gzipPaths = await resolveIonGzipPaths(args.dumpDir);
    return { exportUid: '', dataDir: args.dumpDir, gzipPaths };
  }
  const metaPath = join(args.ionCacheDir, 'latest.json');
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    const gzipPaths = await resolveIonGzipPaths(meta.dataDir ?? join(args.ionCacheDir, meta.exportUid));
    return { exportUid: meta.exportUid ?? '', dataDir: meta.dataDir, gzipPaths };
  } catch {
    if (!args.downloadDump) {
      throw new Error('No dump: pass --dump-dir, --download-dump, or run npm run download-ion-dump first');
    }
    await mkdir(args.ionCacheDir, { recursive: true });
    const downloaded = await downloadLatestIonDump(args.ionCacheDir);
    const meta = {
      exportUid: downloaded.exportUid,
      dataDir: downloaded.dataDir,
      downloadedAt: new Date().toISOString(),
    };
    await writeFile(join(args.ionCacheDir, 'latest.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    const gzipPaths = await resolveIonGzipPaths(downloaded.dataDir);
    return { exportUid: downloaded.exportUid, dataDir: downloaded.dataDir, gzipPaths };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const stage = STAGES[args.stage];
  if (!stage) {
    throw new Error(`Unknown stage: ${args.stage}`);
  }
  process.env.AWS_PROFILE = stage.profile;

  await mkdir(args.workDir, { recursive: true });
  const cognitoPath = join(args.workDir, 'cognito-users.json');

  let cognitoUsers;
  if (args.skipCognitoExport) {
    cognitoUsers = JSON.parse(await readFile(cognitoPath, 'utf8'));
    console.log(`Reused ${cognitoPath} (${cognitoUsers.length} users)`);
  } else {
    console.log(`Exporting Cognito pool ${stage.userPoolId}...`);
    cognitoUsers = await exportCognitoUsers(stage.userPoolId);
    await writeFile(cognitoPath, `${JSON.stringify(cognitoUsers, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${cognitoPath} (${cognitoUsers.length} users)`);
  }

  if (args.downloadDump && !args.dumpDir) {
    console.log('Downloading latest ION dump (may take several minutes)...');
  }
  const dump = await resolveDumpPaths(args);
  const dumpUserIds = await collectUserIdsFromDump(dump.gzipPaths);

  const nowMs = Date.now();
  const minAgeMs = args.minAgeDays * MS_PER_DAY;
  const { missing, tooYoung } = filterCognitoMissingInDump(
    cognitoUsers,
    dumpUserIds,
    minAgeMs,
    nowMs,
  );
  const missingPath = join(args.workDir, 'missing-in-dump.json');
  await writeFile(missingPath, `${JSON.stringify(missing, null, 2)}\n`, 'utf8');
  console.log(`Cognito ≥${args.minAgeDays}d: ${cognitoUsers.length - tooYoung} (excluded ${tooYoung} newer)`);
  console.log(`Missing USER.sk in dump snapshot: ${missing.length} → ${missingPath}`);

  let confirmed = missing.map((u) => ({ ...u, liveUserRow: null, liveBotRow: null }));
  let excluded = [];
  if (!args.skipLiveConfirm && missing.length > 0) {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
    console.log(`Live DynamoDB confirm on ${stage.table}...`);
    const live = await liveConfirm(client, stage.table, missing);
    confirmed = live.confirmed;
    excluded = live.excluded;
    await writeFile(
      join(args.workDir, 'excluded-after-live.json'),
      `${JSON.stringify(excluded, null, 2)}\n`,
      'utf8',
    );
    console.log(`Live confirm: ${confirmed.length} no USER row, ${excluded.length} excluded`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    stage: args.stage,
    table: stage.table,
    userPoolId: stage.userPoolId,
    minAccountAgeDays: args.minAgeDays,
    exportUid: dump.exportUid || undefined,
    dumpDataDir: dump.dataDir,
    paths: {
      cognitoExport: cognitoPath,
      missingInDump: missingPath,
      output: args.out,
    },
    summary: {
      cognitoExported: cognitoUsers.length,
      cognitoOlderThanMinAge: cognitoUsers.length - tooYoung,
      ddbUserDistinctInDump: dumpUserIds.size,
      missingUserInDump: missing.length,
      confirmedNoLiveUserRow: confirmed.length,
      excludedAfterLive: excluded.length,
    },
    confirmedNoDdbUser: confirmed,
    excludedAfterLive: excluded.length > 0 ? excluded : undefined,
  };

  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${args.out}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});