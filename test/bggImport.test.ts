import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BGG_IMPORT_AUTHOR_ID,
  buildApUsernameIndexFromRows,
  buildBggImportAuthorEngagementRows,
  buildWishlistMetaFromBggImport,
  parseBggWishlistXml,
  resolveBggSubmitter,
  shouldBggImportAutoEngageAuthor,
} from '../lib/feedback/bggImport.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bgg-wishlist-excerpt.xml');

test('parseBggWishlistXml reads excerpt items', () => {
  const xml = readFileSync(fixturePath, 'utf8');
  const items = parseBggWishlistXml(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, 'Hive');
  assert.equal(items[0]?.bggGameId, '2655');
  assert.equal(items[0]?.legacyVoteCount, 42);
  assert.equal(items[0]?.legacyBggItemId, '12345');
});

test('buildWishlistMetaFromBggImport sets legacy vote fields', () => {
  const xml = readFileSync(fixturePath, 'utf8');
  const [item] = parseBggWishlistXml(xml);
  assert.ok(item);
  const meta = buildWishlistMetaFromBggImport(item);
  assert.equal(meta.kind, 'wishlist');
  assert.equal(meta.legacyVoteCount, 42);
  assert.equal(meta.effectiveVotes, 42);
  assert.equal(meta.wishlistCategory, 'none');
  assert.equal(meta.bggGameId, '2655');
  assert.equal(meta.authorId, BGG_IMPORT_AUTHOR_ID);
});

test('resolveBggSubmitter prefers user map over auto-match', () => {
  const apUsers = buildApUsernameIndexFromRows([
    { id: 'auto-id', name: 'Striton' },
  ]);
  const author = resolveBggSubmitter('Striton', {
    userMap: { Striton: 'mapped-id' },
    apUsers,
    displayNameByUserId: { 'mapped-id': 'Mapped Name' },
  });
  assert.equal(author.authorId, 'mapped-id');
  assert.equal(author.authorName, 'Mapped Name');
});

test('resolveBggSubmitter auto-matches AP username case-insensitively', () => {
  const apUsers = buildApUsernameIndexFromRows([
    { id: 'user-1', name: 'headKace' },
  ]);
  const author = resolveBggSubmitter('headkace', { userMap: {}, apUsers });
  assert.equal(author.authorId, 'user-1');
  assert.equal(author.authorName, 'headKace');
});

test('buildWishlistMetaFromBggImport uses mapped author', () => {
  const xml = readFileSync(fixturePath, 'utf8');
  const [item] = parseBggWishlistXml(xml);
  assert.ok(item);
  const withSubmitter = { ...item, legacyBggSubmitter: 'Striton' };
  const meta = buildWishlistMetaFromBggImport(withSubmitter, 'post-1', {
    userMap: { Striton: 'user-uuid' },
    displayNameByUserId: { 'user-uuid': 'Striton AP' },
  });
  assert.equal(meta.authorId, 'user-uuid');
  assert.equal(meta.authorName, 'Striton AP');
  assert.equal(meta.legacyBggSubmitter, 'Striton');
  assert.equal(meta.voteCount, 0);
  assert.equal(meta.effectiveVotes, 42);
  assert.equal(buildBggImportAuthorEngagementRows(meta, withSubmitter, {
    userMap: { Striton: 'user-uuid' },
  }).length, 0);
});

test('buildWishlistMetaFromBggImport auto-votes mapped non-Striton authors', () => {
  const xml = readFileSync(fixturePath, 'utf8');
  const [item] = parseBggWishlistXml(xml);
  assert.ok(item);
  const withSubmitter = { ...item, legacyBggSubmitter: 'Kalabas07' };
  const resolver = {
    userMap: { Kalabas07: 'user-uuid' },
    displayNameByUserId: { 'user-uuid': 'Kalabas07' },
  };
  const meta = buildWishlistMetaFromBggImport(withSubmitter, 'post-2', resolver);
  assert.equal(shouldBggImportAutoEngageAuthor('Kalabas07', 'user-uuid'), true);
  assert.equal(shouldBggImportAutoEngageAuthor('Striton', 'user-uuid'), false);
  assert.equal(meta.voteCount, 1);
  assert.equal(meta.effectiveVotes, 43);
  const rows = buildBggImportAuthorEngagementRows(meta, withSubmitter, resolver);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.entityType, 'subscribe');
  assert.equal(rows[1]?.entityType, 'vote');
  assert.equal(rows[2]?.entityType, 'userIndex');
});
