import { test } from 'vitest';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import {
  assertAllowedDownloadedImage,
  bggApiToken,
  contentTypeFromImageUrl,
  fetchBggRepresentativeImageUrl,
} from '../lib/feedback/bggImage.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

test('contentTypeFromImageUrl infers common image types', () => {
  assert.equal(contentTypeFromImageUrl('https://example.com/cover.jpg'), 'image/jpeg');
  assert.equal(contentTypeFromImageUrl('https://example.com/cover.png'), 'image/png');
  assert.equal(contentTypeFromImageUrl('https://example.com/cover.webp'), 'image/webp');
});

test('assertAllowedDownloadedImage enforces size and type', () => {
  assert.equal(assertAllowedDownloadedImage('image/jpeg', 1024).ok, true);
  assert.equal(assertAllowedDownloadedImage('image/gif', 1024).ok, false);
  assert.equal(assertAllowedDownloadedImage('image/jpeg', 6_000_000).ok, false);
});

test('bggApiToken requires BGG_API_TOKEN', () => {
  const previous = process.env.BGG_API_TOKEN;
  delete process.env.BGG_API_TOKEN;
  assert.throws(() => bggApiToken(), /BGG_API_TOKEN/);
  process.env.BGG_API_TOKEN = previous;
});

test('fetchBggRepresentativeImageUrl rejects invalid ids without calling BGG', async () => {
  process.env.BGG_API_TOKEN = process.env.BGG_API_TOKEN ?? 'test-token';
  const result = await fetchBggRepresentativeImageUrl('not-a-number');
  assert.equal(result, undefined);
});

test('BGG thing XML exposes representative image URL', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<items total="1" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="13">
    <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/full.jpg</image>
  </item>
</items>`;
  const parsed = parser.parse(xml) as {
    items?: { item?: { image?: string; thumbnail?: string } };
  };
  const item = parsed.items?.item;
  assert.equal(item?.image, 'https://cf.geekdo-images.com/full.jpg');
  assert.equal(item?.thumbnail, 'https://cf.geekdo-images.com/thumb.jpg');
});
