"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const aboutSaves_1 = require("../lib/aboutSaves");

const TODAY = new Date('2026-08-25T15:00:00.000Z');

(0, node_test_1.test)('utcDateString uses UTC calendar day', () => {
  strict_1.default.equal((0, aboutSaves_1.utcDateString)(TODAY), '2026-08-25');
});

(0, node_test_1.test)('checkAboutSaveAllowed skips unchanged text', () => {
  const result = (0, aboutSaves_1.checkAboutSaveAllowed)('same text', 'same text', {}, TODAY);
  strict_1.default.equal(result.ok, true);
  if (result.ok) {
    strict_1.default.equal(result.skip, true);
  }
});

(0, node_test_1.test)('checkAboutSaveAllowed increments count on same day', () => {
  const result = (0, aboutSaves_1.checkAboutSaveAllowed)('old', 'new', {
    aboutSaveDay: '2026-08-25',
    aboutSaveCount: 3,
  }, TODAY);
  strict_1.default.equal(result.ok, true);
  if (result.ok && !result.skip) {
    strict_1.default.equal(result.aboutSaveDay, '2026-08-25');
    strict_1.default.equal(result.aboutSaveCount, 4);
  }
});

(0, node_test_1.test)('checkAboutSaveAllowed resets count on new day', () => {
  const result = (0, aboutSaves_1.checkAboutSaveAllowed)('old', 'new', {
    aboutSaveDay: '2026-08-24',
    aboutSaveCount: 9,
  }, TODAY);
  strict_1.default.equal(result.ok, true);
  if (result.ok && !result.skip) {
    strict_1.default.equal(result.aboutSaveDay, '2026-08-25');
    strict_1.default.equal(result.aboutSaveCount, 1);
  }
});

(0, node_test_1.test)('checkAboutSaveAllowed blocks when daily limit reached', () => {
  const result = (0, aboutSaves_1.checkAboutSaveAllowed)('old', 'new', {
    aboutSaveDay: '2026-08-25',
    aboutSaveCount: aboutSaves_1.ABOUT_SAVES_PER_DAY_LIMIT,
  }, TODAY);
  strict_1.default.equal(result.ok, false);
  if (!result.ok) {
    strict_1.default.match(result.message, /rate limit/i);
  }
});
