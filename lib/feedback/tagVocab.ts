import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { FeedbackKind } from './types.js';

export const FEEDBACK_TAG_VOCAB_PK = 'CONFIG#FEEDBACK';
export const FEEDBACK_TAG_VOCAB_SK = 'TAGVOCAB';

export type FeedbackTagVocabEntry = {
  id: string;
  kinds: Extract<FeedbackKind, 'bug' | 'feature'>[];
};

export type FeedbackTagVocab = {
  tags: FeedbackTagVocabEntry[];
};

export const DEFAULT_FEEDBACK_TAG_VOCAB: FeedbackTagVocabEntry[] = [
  { id: 'dashboard', kinds: ['bug', 'feature'] },
  { id: 'games', kinds: ['bug', 'feature'] },
  { id: 'game_client', kinds: ['bug', 'feature'] },
  { id: 'tournaments', kinds: ['bug', 'feature'] },
  { id: 'players', kinds: ['feature'] },
  { id: 'stats', kinds: ['feature'] },
  { id: 'challenges', kinds: ['feature'] },
  { id: 'chat', kinds: ['bug', 'feature'] },
  { id: 'designer', kinds: ['feature'] },
  { id: 'themes', kinds: ['feature'] },
  { id: 'account', kinds: ['bug', 'feature'] },
  { id: 'i18n', kinds: ['bug', 'feature'] },
  { id: 'accessibility', kinds: ['bug', 'feature'] },
  { id: 'rules_engine', kinds: ['bug'] },
  { id: 'tables', kinds: ['feature'] },
];

function isValidTagId(id: string): boolean {
  return /^[a-z0-9_]+$/.test(id);
}

function normalizeVocabEntries(raw: unknown): FeedbackTagVocabEntry[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: FeedbackTagVocabEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return undefined;
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || !isValidTagId(id) || seen.has(id)) {
      return undefined;
    }
    if (!Array.isArray(entry.kinds) || entry.kinds.length === 0) {
      return undefined;
    }
    const kinds: Extract<FeedbackKind, 'bug' | 'feature'>[] = [];
    for (const kind of entry.kinds) {
      if (kind !== 'bug' && kind !== 'feature') {
        return undefined;
      }
      if (!kinds.includes(kind)) {
        kinds.push(kind);
      }
    }
    seen.add(id);
    out.push({ id, kinds });
  }
  return out.length > 0 ? out : undefined;
}

export async function getFeedbackTagVocab(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<FeedbackTagVocab> {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: FEEDBACK_TAG_VOCAB_PK, sk: FEEDBACK_TAG_VOCAB_SK },
  }));
  const parsed = normalizeVocabEntries(result.Item?.tags);
  if (parsed) {
    return { tags: parsed };
  }
  const seeded = DEFAULT_FEEDBACK_TAG_VOCAB;
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: FEEDBACK_TAG_VOCAB_PK,
      sk: FEEDBACK_TAG_VOCAB_SK,
      entityType: 'tagVocab',
      tags: seeded,
      updatedAt: Date.now(),
    },
  }));
  return { tags: seeded };
}

export async function setFeedbackTagVocab(
  client: DynamoDBDocumentClient,
  tableName: string,
  tags: FeedbackTagVocabEntry[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = normalizeVocabEntries(tags);
  if (!normalized) {
    return { ok: false, message: 'tags must be a non-empty list of valid tag entries.' };
  }
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: FEEDBACK_TAG_VOCAB_PK,
      sk: FEEDBACK_TAG_VOCAB_SK,
      entityType: 'tagVocab',
      tags: normalized,
      updatedAt: Date.now(),
    },
  }));
  return { ok: true };
}

export function vocabIdsForKind(vocab: FeedbackTagVocab, kind: FeedbackKind): Set<string> {
  if (kind !== 'bug' && kind !== 'feature') {
    return new Set();
  }
  const ids = new Set<string>();
  for (const entry of vocab.tags) {
    if (entry.kinds.includes(kind)) {
      ids.add(entry.id);
    }
  }
  return ids;
}

export function publicTagVocabResponse(vocab: FeedbackTagVocab): { tags: FeedbackTagVocabEntry[] } {
  return { tags: vocab.tags };
}
