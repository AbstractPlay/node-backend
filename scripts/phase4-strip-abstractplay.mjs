/**
 * Remove handlers moved to lib/public and lib/games from abstractplay.ts.
 * Run: node scripts/phase4-strip-abstractplay.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const filePath = path.join(root, 'api/abstractplay.ts');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

/** Inclusive 1-based line ranges to delete, processed in descending order. */
const removeRanges = [
  [9010, 9064],
  [7642, 7721],
  [7065, 7363],
  [6757, 6817],
  [6730, 6755],
  [5217, 5240],
  [2561, 2599],
  [2312, 2389],
  [2140, 2158],
  [1965, 1980],
  [1707, 1759],
  [1396, 1438],
  [1388, 1394],
  [1073, 1227],
  [968, 1071],
  [949, 966],
  [888, 947],
  [781, 823],
  [720, 779],
  [697, 718],
  [617, 695],
  [570, 615],
];

let out = [...lines];
for (const [start, end] of removeRanges) {
  out.splice(start - 1, end - start + 1);
}

const insertMarker = "import { loadSummaryPlayerCountsByUid } from '../lib/summaryRatings.js';";
const insertBlock = `${insertMarker}
import { getPlayerRelationIds } from '../lib/playerRelations.js';
import {
  ensureMetaGameCountEntry,
  ensureMissingMetaGameCounts,
  assembleTags,
  DEFAULT_META_GAME_COUNTS,
} from '../lib/metaGameBootstrap.js';
import { getPlayers } from '../lib/players/getPlayers.js';
import { setSeenTime } from '../lib/games/setSeenTime.js';
import { feedbackErrorResponse } from '../lib/api/feedbackHttp.js';
import { game } from '../lib/games/getGame.js';
import { botMove } from '../lib/games/botMove.js';
export {
  userNames,
  games,
  metaGamesDetails,
  recentCompletedGames,
  challengeDetails,
  standingChallenges,
  allStandingChallenges,
  playerHighlights,
  playerAbout,
  representativeGames,
  feedbackListOpen,
  feedbackGetOpen,
  feedbackHistoryListOpen,
  feedbackWishlistSearchOpen,
  announcementsListOpen,
  announcementGetOpen,
  logLayoutEventOpen,
  reportProblem,
  getPublicExploration,
  getTournaments,
  getOldTournaments,
  getTournament,
  archiveTournaments,
  eventGetEvent,
  eventGetEvents,
} from '../lib/public/index.js';`;

const idx = out.findIndex((l) => l === insertMarker);
if (idx === -1) {
  console.error('insert marker not found');
  process.exit(1);
}
out[idx] = insertBlock;

const exportTimeloss = '  timeloss,';
const exportIdx = out.findIndex((l) => l === '  checkForTimeloss,');
if (exportIdx !== -1 && !out.slice(exportIdx - 3, exportIdx).some((l) => l.includes('timeloss'))) {
  out.splice(exportIdx, 0, exportTimeloss);
}

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('stripped abstractplay.ts, new line count', out.length);
