#!/usr/bin/env node
/**
 * Import Discord forum threads into the feedback DynamoDB table.
 *
 * Usage:
 *   npm run import-discord-feedback -- --stage dev --dry-run --token-file path/to/token.txt
 *   npx tsx bin/import-discord-feedback.mjs --stage dev --kind bug --dry-run
 *
 * Requires tsx to load lib/*.ts sources. Plain `node` will not work.
 * Dry-run is the default; pass --live to write.
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  planDiscordThreadImport,
  resolveExcludeTagIds,
  shouldImportThread,
} from '../lib/feedback/discordImport.js';
import { kindGsi1Pk, listSortPrefix } from '../lib/feedback/keys.js';

const DISCORD_API = 'https://discord.com/api/v10';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    stage: '',
    config: 'bin/discord-feedback-import.config.json',
    tokenFile: '',
    mapFile: '',
    kind: 'all',
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--live') {
      args.dryRun = false;
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--config' && argv[i + 1]) {
      args.config = argv[++i];
    } else if (arg === '--token-file' && argv[i + 1]) {
      args.tokenFile = argv[++i];
    } else if (arg === '--map' && argv[i + 1]) {
      args.mapFile = argv[++i];
    } else if (arg === '--kind' && argv[i + 1]) {
      args.kind = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    }
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

function loadToken(tokenFile) {
  const fromEnv = process.env.DISCORD_BOT_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (tokenFile) {
    return readFileSync(tokenFile, 'utf8').trim();
  }
  throw new Error('Discord token required: set DISCORD_BOT_TOKEN or pass --token-file');
}

async function discordGet(token, path) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function fetchAllThreads(token, channelId) {
  const channel = await discordGet(token, `/channels/${channelId}`);
  const availableTags = channel.available_tags ?? [];
  const threads = [];

  const active = await discordGet(token, `/channels/${channelId}/threads/active`);
  threads.push(...(active.threads ?? []));

  let archivedBefore;
  do {
    const archivedQuery = archivedBefore ? `?before=${archivedBefore}` : '';
    const archived = await discordGet(token, `/channels/${channelId}/threads/archived/public${archivedQuery}`);
    threads.push(...(archived.threads ?? []));
    if (!archived.has_more) {
      break;
    }
    archivedBefore = archived.threads?.at(-1)?.thread_metadata?.archive_timestamp;
  } while (archivedBefore);

  return { threads, availableTags };
}

async function fetchAllMessages(token, threadId) {
  const messages = [];
  let before;
  do {
    const query = before ? `?before=${before}&limit=100` : '?limit=100';
    const batch = await discordGet(token, `/channels/${threadId}/messages${query}`);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    messages.push(...batch);
    before = batch[batch.length - 1]?.id;
    if (batch.length < 100) {
      break;
    }
  } while (before);
  return messages;
}

async function existingDiscordThreadIds(client, tableName, kind) {
  const ids = new Set();
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'ByKind',
      KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': kindGsi1Pk(kind),
        ':prefix': listSortPrefix('votes'),
      },
      ProjectionExpression: 'legacyDiscordThreadId',
      ExclusiveStartKey: lastKey,
      Limit: 200,
    }));
    for (const item of result.Items ?? []) {
      if (item.legacyDiscordThreadId) {
        ids.add(String(item.legacyDiscordThreadId));
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage) {
    console.error('Usage: npm run import-discord-feedback -- --stage dev|prod [--dry-run|--live] [--kind bug|feature|all] [--token-file path] [--map path] [--limit N]');
    process.exit(1);
  }

  const token = loadToken(args.tokenFile);
  const config = JSON.parse(readFileSync(args.config, 'utf8'));
  const userMap = args.mapFile
    ? JSON.parse(readFileSync(args.mapFile, 'utf8'))
    : {};
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const kinds = args.kind === 'all' ? ['bug', 'feature'] : [args.kind];
  const report = { imported: 0, skippedExisting: 0, skippedTags: 0, skippedEmpty: 0, comments: 0 };

  for (const kind of kinds) {
    const channelId = kind === 'bug' ? config.bugForumChannelId : config.featureForumChannelId;
    const excludeNames = config.excludeTagsByKind?.[kind] ?? [];
    const { threads, availableTags } = await fetchAllThreads(token, channelId);
    const excludeTagIds = resolveExcludeTagIds(availableTags, excludeNames);
    const existing = args.dryRun ? new Set() : await existingDiscordThreadIds(client, tableName, kind);
    const staffBotUserIds = new Set(config.staffBotUserIds ?? []);

    let processed = 0;
    for (const thread of threads) {
      if (args.limit > 0 && processed >= args.limit) {
        break;
      }
      if (!shouldImportThread(thread, excludeTagIds)) {
        report.skippedTags += 1;
        continue;
      }
      if (existing.has(thread.id)) {
        report.skippedExisting += 1;
        continue;
      }

      const messages = await fetchAllMessages(token, thread.id);
      const planned = planDiscordThreadImport({
        kind,
        thread,
        messagesNewestFirst: messages,
        userMap,
        staffBotUserIds,
      });
      if ('ok' in planned && planned.ok === false) {
        report.skippedEmpty += 1;
        continue;
      }

      report.comments += planned.comments.length;
      if (!args.dryRun) {
        const writes = [
          { Put: { TableName: tableName, Item: planned.meta } },
          ...planned.listRows.map((row) => ({ Put: { TableName: tableName, Item: row } })),
        ];
        await client.send(new TransactWriteCommand({ TransactItems: writes }));
        for (const comment of planned.comments) {
          await client.send(new PutCommand({ TableName: tableName, Item: comment }));
        }
      }
      report.imported += 1;
      processed += 1;
    }
  }

  console.log(`${args.dryRun ? 'Dry run' : 'Import'} complete for ${args.stage} (${args.kind}):`);
  console.log(`  threads imported: ${report.imported}`);
  console.log(`  comments: ${report.comments}`);
  console.log(`  skipped (existing): ${report.skippedExisting}`);
  console.log(`  skipped (excluded tag): ${report.skippedTags}`);
  console.log(`  skipped (empty): ${report.skippedEmpty}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
