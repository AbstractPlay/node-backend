import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildWishlistMetaFromBggImport, parseBggWishlistXml } from '../lib/feedback/bggImport.js';

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
});
