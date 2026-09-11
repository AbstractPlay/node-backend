#!/usr/bin/env node
/**
 * Import Discord forum threads into the feedback DynamoDB table.
 *
 * Usage:
 *   npm run import-discord-feedback -- --stage prod --dry-run --token-file path/to/token.txt
 *   npm run import-discord-feedback -- --stage prod --kind all --map bin/discord-ap-user-map.json --live
 *
 * Requires tsx to load lib/*.ts sources. Plain `node` will not work.
 * Dry-run is the default; pass --live to write.
 * User map: bin/discord-ap-user-map.json (Discord user ID -> AP UUID); shared by bug and feature import.
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_DISCORD_MAP,
  fetchAllMessages,
  fetchAllThreads,
  loadApUserResolver,
  loadToken,
  loadUserMap,
} from './discord-feedback-import-lib.mjs';
import {
  isUnmappedDiscordAuthor,
  planDiscordThreadImport,
  resolveDiscordAuthor,
  resolveExcludeTagIds,
  shouldImportThread,
} from '../lib/feedback/discordImport.js';
import { kindGsi1Pk, listSortPrefix } from '../lib/feedback/keys.js';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    stage: '',
    config: 'bin/discord-feedback-import.config.json',
    tokenFile: '',
    mapFile: DEFAULT_DISCORD_MAP,
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
    } else if (arg === '--no-map') {
      args.mapFile = '';
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

function trackAuthor(store, user, resolver) {
  if (user.bot) {
    return;
  }
  const author = resolveDiscordAuthor(user, resolver);
  const entry = store.get(user.id) ?? { mapped: 0, unmapped: 0 };
  if (isUnmappedDiscordAuthor(author)) {
    entry.unmapped += 1;
  } else {
    entry.mapped += 1;
  }
  store.set(user.id, entry);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage) {
    console.error('Usage: npm run import-discord-feedback -- --stage dev|prod [--dry-run|--live] [--kind bug|feature|all] [--token-file path] [--map bin/discord-ap-user-map.json] [--limit N]');
    console.error('Dry-run is the default; pass --live to write to DynamoDB.');
    process.exit(1);
  }

  const token = loadToken(args.tokenFile);
  const config = JSON.parse(readFileSync(args.config, 'utf8'));
  const userMap = loadUserMap(args.mapFile);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const { usernameToUserId, displayNameByUserId } = await loadApUserResolver(client, args.stage);
  const resolver = { userMap, usernameToUserId, displayNameByUserId };

  const kinds = args.kind === 'all' ? ['bug', 'feature'] : [args.kind];
  const report = {
    imported: 0,
    skippedExisting: 0,
    skippedTags: 0,
    skippedEmpty: 0,
    comments: 0,
  };
  const authorStats = new Map();

  if (args.dryRun) {
    console.log('*** DRY RUN — no data written. Pass --live to import. ***');
  } else {
    console.log(`*** LIVE import into ${tableName} ***`);
  }
  if (args.mapFile) {
    console.log(`User map: ${args.mapFile} (${Object.keys(userMap).filter((k) => userMap[k]).length} filled entries)`);
  }

  for (const kind of kinds) {
    const channelId = kind === 'bug' ? config.bugForumChannelId : config.featureForumChannelId;
    const excludeNames = config.excludeTagsByKind?.[kind] ?? [];
    const { threads, availableTags } = await fetchAllThreads(token, channelId, config.guildId);
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
      for (const message of messages) {
        trackAuthor(authorStats, message.author, resolver);
      }

      const planned = planDiscordThreadImport({
        kind,
        thread,
        messagesNewestFirst: messages,
        userMap,
        usernameToUserId,
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

  const unmappedAuthors = [...authorStats.values()].filter((entry) => entry.unmapped > 0).length;
  const mappedAuthors = [...authorStats.values()].filter((entry) => entry.mapped > 0 && entry.unmapped === 0).length;
  const mixedAuthors = [...authorStats.values()].filter((entry) => entry.mapped > 0 && entry.unmapped > 0).length;

  console.log(`${args.dryRun ? 'Dry run' : 'Import'} complete for ${args.stage} (${args.kind}):`);
  console.log(`  threads imported: ${report.imported}`);
  console.log(`  comments: ${report.comments}`);
  console.log(`  skipped (existing): ${report.skippedExisting}`);
  console.log(`  skipped (excluded tag): ${report.skippedTags}`);
  console.log(`  skipped (empty): ${report.skippedEmpty}`);
  console.log(`  authors: ${mappedAuthors} fully mapped, ${mixedAuthors} mixed, ${unmappedAuthors} need map entries`);
  if (args.dryRun && unmappedAuthors > 0) {
    console.log(`  Run: npm run report-discord-feedback-users -- --stage ${args.stage} --kind ${args.kind} --emit-map`);
  }
  if (args.dryRun) {
    console.log('Re-run with --live to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
