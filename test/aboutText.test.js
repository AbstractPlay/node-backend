"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const aboutText_1 = require("../lib/aboutText");

(0, node_test_1.test)('validateAboutText accepts plain markdown', () => {
  const result = (0, aboutText_1.validateAboutText)('Hello **world**\n\n- item one\n- [link](https://example.com)');
  strict_1.default.equal(result.ok, true);
});

(0, node_test_1.test)('validateAboutText rejects HTML tags', () => {
  const result = (0, aboutText_1.validateAboutText)('Hello <script>alert(1)</script>');
  strict_1.default.equal(result.ok, false);
  if (!result.ok) {
    strict_1.default.match(result.message, /HTML/i);
  }
});

(0, node_test_1.test)('validateAboutText rejects image markdown', () => {
  const result = (0, aboutText_1.validateAboutText)('Look ![alt](https://example.com/x.png)');
  strict_1.default.equal(result.ok, false);
  if (!result.ok) {
    strict_1.default.match(result.message, /image/i);
  }
});

(0, node_test_1.test)('validateAboutText rejects over byte limit', () => {
  const big = 'x'.repeat(aboutText_1.ABOUT_MAX_BYTES + 1);
  strict_1.default.ok((0, aboutText_1.aboutTextByteLength)(big) > aboutText_1.ABOUT_MAX_BYTES);
  const result = (0, aboutText_1.validateAboutText)(big);
  strict_1.default.equal(result.ok, false);
});

(0, node_test_1.test)('validateAboutText rejects too many URLs', () => {
  const links = Array.from({ length: aboutText_1.ABOUT_MAX_URLS + 1 }, (_, i) => `https://example.com/${i}`).join(' ');
  const result = (0, aboutText_1.validateAboutText)(links);
  strict_1.default.equal(result.ok, false);
});

(0, node_test_1.test)('aboutTextPlainSnippet strips markdown', () => {
  const snippet = (0, aboutText_1.aboutTextPlainSnippet)('# Title\n\nHello [site](https://example.com) **bold**', 40);
  strict_1.default.ok(snippet.length <= 40);
  strict_1.default.match(snippet, /Hello site bold/);
});
