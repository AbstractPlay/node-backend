import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildApUsernameIndexFromRows } from '../lib/feedback/bggImport.js';
import { buildDiscordUsernameToUserId } from '../lib/feedback/discordImport.js';

export const DISCORD_API = 'https://discord.com/api/v10';
export const DEFAULT_DISCORD_MAP = join(dirname(fileURLToPath(import.meta.url)), 'discord-ap-user-map.json');

export function loadToken(tokenFile) {
  const fromEnv = process.env.DISCORD_BOT_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (tokenFile) {
    return readFileSync(tokenFile, 'utf8').trim();
  }
  throw new Error('Discord token required: set DISCORD_BOT_TOKEN or pass --token-file');
}

export function loadUserMap(mapFile) {
  if (!mapFile || !existsSync(mapFile)) {
    return {};
  }
  const raw = JSON.parse(readFileSync(mapFile, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`User map must be a JSON object: ${mapFile}`);
  }
  const userMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      userMap[key] = value.trim();
    }
  }
  return userMap;
}

export function mergeUserMapFile(mapFile, discordUserIds) {
  const existing = loadUserMap(mapFile);
  let added = 0;
  for (const discordUserId of discordUserIds) {
    if (!(discordUserId in existing)) {
      existing[discordUserId] = '';
      added += 1;
    }
  }
  writeFileSync(mapFile, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return { existing, added };
}

export async function loadApUserResolver(client, stage) {
  const tableName = stage === 'prod'
    ? (process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod')
    : (process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev');
  const rows = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'USERS' },
      ProjectionExpression: 'sk, #name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const id = String(item.sk);
      if (name) {
        rows.push({ id, name });
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  const index = buildApUsernameIndexFromRows(rows);
  const displayNameByUserId = {};
  for (const row of rows) {
    displayNameByUserId[row.id] = row.name;
  }
  return {
    usernameToUserId: buildDiscordUsernameToUserId(index),
    displayNameByUserId,
  };
}

export async function discordGet(token, path) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function fetchAllThreads(token, channelId, guildId) {
  const channel = await discordGet(token, `/channels/${channelId}`);
  const availableTags = channel.available_tags ?? [];
  const threads = [];

  // Forum channels (type 15): /channels/{id}/threads/active returns 404; use guild endpoint.
  if (guildId) {
    const guildActive = await discordGet(token, `/guilds/${guildId}/threads/active`);
    threads.push(...(guildActive.threads ?? []).filter((thread) => thread.parent_id === channelId));
  } else {
    const active = await discordGet(token, `/channels/${channelId}/threads/active`);
    threads.push(...(active.threads ?? []));
  }

  let archivedBefore;
  do {
    const archivedQuery = archivedBefore
      ? `?before=${encodeURIComponent(archivedBefore)}`
      : '';
    const archived = await discordGet(token, `/channels/${channelId}/threads/archived/public${archivedQuery}`);
    threads.push(...(archived.threads ?? []));
    if (!archived.has_more) {
      break;
    }
    archivedBefore = archived.threads?.at(-1)?.thread_metadata?.archive_timestamp;
  } while (archivedBefore);

  return { threads, availableTags };
}

export async function fetchAllMessages(token, threadId) {
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
