import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  ABOUT_MAX_BYTES,
  ABOUT_MAX_URLS,
  aboutTextByteLength,
  aboutTextPlainSnippet,
  validateAboutText,
} from '../lib/aboutText.js';

test('validateAboutText accepts plain markdown', () => {
  const result = validateAboutText('Hello **world**\n\n- item one\n- [link](https://example.com)');
  assert.equal(result.ok, true);
});

test('validateAboutText rejects HTML tags', () => {
  const result = validateAboutText('Hello <script>alert(1)</script>');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /HTML/i);
  }
});

test('validateAboutText rejects image markdown', () => {
  const result = validateAboutText('Look ![alt](https://example.com/x.png)');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /image/i);
  }
});

test('validateAboutText rejects over byte limit', () => {
  const big = 'x'.repeat(ABOUT_MAX_BYTES + 1);
  assert.ok(aboutTextByteLength(big) > ABOUT_MAX_BYTES);
  const result = validateAboutText(big);
  assert.equal(result.ok, false);
});

test('validateAboutText rejects too many URLs', () => {
  const links = Array.from({ length: ABOUT_MAX_URLS + 1 }, (_, i) => `https://example.com/${i}`).join(' ');
  const result = validateAboutText(links);
  assert.equal(result.ok, false);
});

test('aboutTextPlainSnippet strips markdown', () => {
  const snippet = aboutTextPlainSnippet('# Title\n\nHello [site](https://example.com) **bold**', 40);
  assert.ok(snippet.length <= 40);
  assert.match(snippet, /Hello site bold/);
});
