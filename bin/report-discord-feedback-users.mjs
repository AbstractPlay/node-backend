#!/usr/bin/env node
/**
 * Report Discord forum authors for bug/feature import and optionally extend the user map.
 *
 * Usage:
 *   npm run report-discord-feedback-users -- --stage prod --token-file path/to/token.txt
 *   npm run report-discord-feedback-users -- --stage prod --kind all --emit-map
 *
 * Map file (shared by bug + feature import): bin/discord-ap-user-map.json
 * Format: { "discordUserId": "apUserUuid", ... }
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_DISCORD_MAP,
  fetchAllMessages,
  fetchAllThreads,
  loadApUserResolver,
  loadToken,
  loadUserMap,
  mergeUserMapFile,
} from './discord-feedback-import-lib.mjs';
import {
  discordUserDisplayName,
  isUnmappedDiscordAuthor,
  planDiscordThreadImport,
  resolveDiscordAuthor,
  resolveExcludeTagIds,
  shouldImportThread,
  sortDiscordMessagesOldestFirst,
} from '../lib/feedback/discordImport.js';

function parseArgs(argv) {
  const args = {
    stage: 'prod',
    config: 'bin/discord-feedback-import.config.json',
    tokenFile: '',
    mapFile: DEFAULT_DISCORD_MAP,
    kind: 'all',
    emitMap: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--config' && argv[i + 1]) {
      args.config = argv[++i];
    } else if (arg === '--token-file' && argv[i + 1]) {
      args.tokenFile = argv[++i];
    } else if (arg === '--map' && argv[i + 1]) {
      args.mapFile = argv[++i];
    } else if (arg === '--kind' && argv[i + 1]) {
      args.kind = argv[++i];
    } else if (arg === '--emit-map') {
      args.emitMap = true;
    }
  }
  return args;
}

function recordUser(store, user, kind, resolver) {
  if (user.bot) {
    return;
  }
  const author = resolveDiscordAuthor(user, resolver);
  const entry = store.get(user.id) ?? {
    discordUserId: user.id,
    username: user.username,
    displayName: discordUserDisplayName(user),
    kinds: new Set(),
    threads: 0,
    messages: 0,
    mapped: false,
    mapSource: '',
    apUserId: '',
    apName: '',
  };
  entry.kinds.add(kind);
  entry.messages += 1;
  if (!isUnmappedDiscordAuthor(author)) {
    entry.mapped = true;
    entry.apUserId = author.authorId;
    entry.apName = resolver.displayNameByUserId?.[author.authorId] ?? author.authorName;
    if (resolver.userMap[user.id]) {
      entry.mapSource = 'map';
    } else {
      entry.mapSource = 'auto';
    }
  }
  store.set(user.id, entry);
}

async function main() {
  const args = parseArgs(process.argv);
  const token = loadToken(args.tokenFile);
  const config = JSON.parse(readFileSync(args.config, 'utf8'));
  const userMap = loadUserMap(args.mapFile);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const { usernameToUserId, displayNameByUserId } = await loadApUserResolver(client, args.stage);
  const resolver = { userMap, usernameToUserId, displayNameByUserId };

  const kinds = args.kind === 'all' ? ['bug', 'feature'] : [args.kind];
  const users = new Map();
  const summary = {
    threads: 0,
    skippedTags: 0,
    skippedEmpty: 0,
    comments: 0,
  };

  for (const kind of kinds) {
    const channelId = kind === 'bug' ? config.bugForumChannelId : config.featureForumChannelId;
    const excludeNames = config.excludeTagsByKind?.[kind] ?? [];
    const { threads, availableTags } = await fetchAllThreads(token, channelId, config.guildId);
    const excludeTagIds = resolveExcludeTagIds(availableTags, excludeNames);
    const staffBotUserIds = new Set(config.staffBotUserIds ?? []);

    for (const thread of threads) {
      if (!shouldImportThread(thread, excludeTagIds)) {
        summary.skippedTags += 1;
        continue;
      }

      const messages = await fetchAllMessages(token, thread.id);
      const planned = planDiscordThreadImport({
        kind,
        thread,
        messagesNewestFirst: messages,
        userMap,
        usernameToUserId,
        staffBotUserIds,
      });
      if ('ok' in planned && planned.ok === false) {
        summary.skippedEmpty += 1;
        continue;
      }

      summary.threads += 1;
      summary.comments += planned.comments.length;

      for (const message of messages) {
        recordUser(users, message.author, kind, resolver);
      }
      const starterId = sortDiscordMessagesOldestFirst(messages)[0]?.author.id;
      const starterEntry = starterId ? users.get(starterId) : undefined;
      if (starterEntry) {
        starterEntry.threads += 1;
      }
    }
  }

  const matched = [];
  const unmatched = [];
  for (const entry of users.values()) {
    if (entry.mapped) {
      matched.push(entry);
    } else {
      unmatched.push(entry);
    }
  }
  matched.sort((a, b) => b.messages - a.messages);
  unmatched.sort((a, b) => b.messages - a.messages);

  const fromMap = matched.filter((row) => row.mapSource === 'map').length;
  const fromAuto = matched.filter((row) => row.mapSource === 'auto').length;

  console.log(`Discord feedback user report (${args.stage}, ${args.kind})`);
  console.log(`Map: ${args.mapFile} (${Object.keys(userMap).filter((k) => userMap[k]).length} filled entries)`);
  console.log(`Threads to import: ${summary.threads}; comments: ${summary.comments}`);
  console.log(`Skipped (excluded tag): ${summary.skippedTags}; skipped (empty): ${summary.skippedEmpty}`);
  console.log(`Unique non-bot authors: ${users.size}`);
  console.log(`Mapped: ${matched.length} (${fromMap} from map, ${fromAuto} auto-matched)`);
  console.log(`Need lookup: ${unmatched.length}`);
  console.log('');

  if (matched.length > 0) {
    console.log('=== Mapped ===');
    for (const row of matched) {
      const kinds = [...row.kinds].join('+');
      console.log(`${row.displayName} (@${row.username}) [${row.discordUserId}] -> ${row.apName} (${row.apUserId}) via ${row.mapSource} [${row.threads} threads, ${row.messages} messages, ${kinds}]`);
    }
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log('=== Need lookup (add to discord-ap-user-map.json) ===');
    for (const row of unmatched) {
      const kinds = [...row.kinds].join('+');
      console.log(`${row.displayName} (@${row.username}) [${row.discordUserId}] — ${row.threads} threads, ${row.messages} messages (${kinds})`);
    }
    console.log('');
    console.log(`Fill AP user UUIDs in ${args.mapFile} (Discord user ID -> AP UUID).`);
  }

  if (args.emitMap) {
    const { added } = mergeUserMapFile(args.mapFile, unmatched.map((row) => row.discordUserId));
    console.log(`Updated ${args.mapFile}: added ${added} new placeholder entries (${Object.keys(loadUserMap(args.mapFile)).length} total keys).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
