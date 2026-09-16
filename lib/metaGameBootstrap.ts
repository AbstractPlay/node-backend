import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { ddbDocClient } from './ddb.js';
import { ensureShardedMetaGameCountEntry } from './gameProjector.js';

export type TagList = {
  meta: string;
  tags: string[];
};

type TagRec = {
  pk: 'TAG';
  sk: string;
  tags: TagList[];
};

export type MetaGameCounts = {
  [metaGame: string]: {
    currentgames: number;
    completedgames: number;
    standingchallenges: number;
    ratings?: number;
    stars?: number;
    tags?: string[];
  };
};

export const DEFAULT_META_GAME_COUNTS = {
  currentgames: 0,
  completedgames: 0,
  standingchallenges: 0,
  stars: 0,
};

export async function ensureMetaGameCountEntry(metaGame: string): Promise<void> {
  await ensureShardedMetaGameCountEntry(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    metaGame,
  );
}

export async function ensureMissingMetaGameCounts(): Promise<void> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const metaGames: string[] = [];
  gameinfo.forEach(g => metaGames.push(g.uid));
  const missing: string[] = [];

  for (let i = 0; i < metaGames.length; i += 100) {
    const chunk = metaGames.slice(i, i + 100);
    const data = await ddbDocClient.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(metaGame => ({ pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' })),
        },
      },
    }));
    const found = new Set(
      (data.Responses?.[tableName] ?? []).map(item => String(item.pk).replace('METAGAMES#', '')),
    );
    for (const metaGame of chunk) {
      if (!found.has(metaGame)) {
        missing.push(metaGame);
      }
    }
  }

  if (missing.length === 0) {
    return;
  }
  console.log(`Initializing sharded METAGAMES# counts for new games: ${missing.join(', ')}`);
  await Promise.all(missing.map(metaGame => ensureMetaGameCountEntry(metaGame)));
}

export async function assembleTags(): Promise<TagList[] | undefined> {
  try {
    const data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TAG" },
        ExpressionAttributeNames: { "#pk": "pk" },
      }));
    const allTags = data.Items as TagRec[];
    const collated = new Map<string, string[]>();
    if (allTags !== undefined) {
      for (const rec of allTags) {
        for (const { meta, tags } of rec.tags) {
          const uniques = new Set<string>(tags);
          if (collated.has(meta)) {
            for (const tag of collated.get(meta)!) {
              uniques.add(tag);
            }
          }
          collated.set(meta, [...uniques.values()].sort((a, b) => a.localeCompare(b)));
        }
      }
    }
    return [...collated.entries()].map(([meta, tags]) => { return { meta, tags } });
  } catch (error) {
    return undefined;
  }
}
