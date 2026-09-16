/**
 * One-off helper: extract handler line ranges from abstractplay.ts into lib modules.
 * Run from repo root: node scripts/phase4-extract-public.mjs
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'api/abstractplay.ts');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function writeRel(relPath, header, body) {
  const outPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${header}\n${body}\n`, 'utf8');
  console.log('wrote', relPath);
}

const commonImports = `import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { validateToken } from '@sunknudsen/totp';
import { ddbDocClient } from '../ddb.js';
import { sesClient, s3Client } from '../api/clients.js';
import {
  headers,
  cachedListHeaders,
  feedbackListHeaders,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import type { User, UsersData } from '../api/types.js';
`;

writeRel(
  'lib/playerRelations.ts',
  `import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb.js';`,
  slice(781, 823).replace(/^async function getPlayerRelationIds/, 'export async function getPlayerRelationIds'),
);

writeRel(
  'lib/metaGameBootstrap.ts',
  `import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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
`,
  slice(585, 615)
    .replace(/^async function ensureMissingMetaGameCounts/, 'export async function ensureMissingMetaGameCounts')
    + '\n\n'
    + slice(968, 996).replace(/^async function assembleTags/, 'export async function assembleTags'),
);

// Catalog handlers
const catalogBody = [
  slice(617, 695).replace(/^async function userNames/, 'export async function userNames'),
  slice(720, 779).replace(/^async function games/, 'export async function games'),
  slice(949, 966).replace(/^async function recentCompletedGames/, 'export async function recentCompletedGames'),
  slice(998, 1071).replace(/^async function metaGamesDetails/, 'export async function metaGamesDetails'),
].join('\n\n');

writeRel(
  'lib/public/catalog.ts',
  `${commonImports}
import { hydrateGameState } from '../gameState.js';
import { loadSummaryPlayerCountsByUid } from '../summaryRatings.js';
import {
  queryRecentCompletedGames,
  type RecentCompletedGamesPars,
} from '../recentCompletedGames.js';
import {
  DEFAULT_META_GAME_COUNTS,
  ensureMissingMetaGameCounts,
  assembleTags,
  type MetaGameCounts,
} from '../metaGameBootstrap.js';

type FullGame = {
  metaGame: string;
  state: string;
  id: string;
  players: User[];
  toMove?: string;
  gameStarted?: number;
  commented?: number;
  variants?: string[];
};
`,
  catalogBody,
);

const challengesBody = [
  slice(697, 718).replace(/^async function challengeDetails/, 'export async function challengeDetails'),
  slice(888, 924).replace(/^async function standingChallenges/, 'export async function standingChallenges'),
  slice(926, 947).replace(/^async function allStandingChallenges/, 'export async function allStandingChallenges'),
].join('\n\n');

writeRel(
  'lib/public/challenges.ts',
  `${commonImports}
import { queryAllStandingChallenges } from '../allStandingChallenges.js';
import { getPlayerRelationIds } from '../playerRelations.js';

type FullChallenge = {
  challenger?: { id: string };
};
`,
  challengesBody,
);

writeRel(
  'lib/public/players.ts',
  commonImports + `import { listHighlights, listMetaGameRecommendations } from '../playerGameMarks.js';`,
  [
    slice(2312, 2327).replace(/^async function playerHighlights/, 'export async function playerHighlights'),
    slice(2329, 2372).replace(/^async function playerAbout/, 'export async function playerAbout'),
    slice(2374, 2389).replace(/^async function representativeGames/, 'export async function representativeGames'),
  ].join('\n\n'),
);

writeRel(
  'lib/public/feedbackOpen.ts',
  `${commonImports}
import {
  feedbackList,
  feedbackGet,
  feedbackHistoryList,
  feedbackWishlistSearch,
  type FeedbackListPars,
  type FeedbackGetPars,
  type FeedbackHistoryListPars,
  type FeedbackWishlistSearchPars,
} from '../feedback/index.js';
import { attachWishlistCoverImageUrls } from '../feedback/attachments.js';
`,
  [
    slice(1707, 1725).replace(/^async function feedbackListOpen/, 'export async function feedbackListOpen'),
    slice(1727, 1742).replace(/^async function feedbackGetOpen/, 'export async function feedbackGetOpen'),
    slice(1744, 1759).replace(/^async function feedbackHistoryListOpen/, 'export async function feedbackHistoryListOpen'),
    slice(1965, 1980).replace(/^async function feedbackWishlistSearchOpen/, 'export async function feedbackWishlistSearchOpen'),
  ].join('\n\n'),
);

writeRel(
  'lib/public/announcementsOpen.ts',
  `${commonImports}
import {
  announcementsList,
  announcementGet,
  type AnnouncementsListPars,
  type AnnouncementGetPars,
} from '../announcements/index.js';
`,
  [
    slice(1396, 1418).replace(/^async function announcementsListOpen/, 'export async function announcementsListOpen'),
    slice(1420, 1439).replace(/^async function announcementGetOpen/, 'export async function announcementGetOpen'),
  ].join('\n\n'),
);

writeRel(
  'lib/public/exploration.ts',
  commonImports,
  slice(6730, 6755).replace(/^async function getPublicExploration/, 'export async function getPublicExploration'),
);

writeRel(
  'lib/public/events.ts',
  commonImports,
  [
    slice(7642, 7684).replace(/^async function eventGetEvent/, 'export async function eventGetEvent'),
    slice(7686, 7721).replace(/^async function eventGetEvents/, 'export async function eventGetEvents'),
  ].join('\n\n'),
);

writeRel(
  'lib/public/analytics.ts',
  `${commonImports}
import { logLayoutEvent, type LayoutEventPars } from '../layoutEvents.js';
import { getPlayers } from '../players/getPlayers.js';
`,
  [
    slice(2140, 2158).replace(/^async function logLayoutEventOpen/, 'export async function logLayoutEventOpen'),
    slice(9010, 9064).replace(/^async function reportProblem/, 'export async function reportProblem'),
  ].join('\n\n'),
);

writeRel(
  'lib/public/tournaments.ts',
  `import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';

type Tournament = {
  id: string;
  metaGame: string;
  variants: string[];
  dateEnded?: number;
  pk?: string;
  sk?: string;
  players?: TournamentPlayer[];
};

type TournamentPlayer = { sk: string };
type TournamentGame = { id: string };
`,
  [
    slice(7115, 7158).replace(/^async function archiveTournaments/, 'export async function archiveTournaments'),
    slice(7160, 7242).replace(/^async function archiveTournament/, 'async function archiveTournament'),
    slice(7065, 7092).replace(/^async function getTournaments/, 'export async function getTournaments'),
    slice(7094, 7113).replace(/^async function getOldTournaments/, 'export async function getOldTournaments'),
    slice(7245, 7363).replace(/^async function getTournament/, 'export async function getTournament'),
  ].join('\n\n'),
);

console.log('Done. Review generated files and fix imports/types before deleting from abstractplay.');
