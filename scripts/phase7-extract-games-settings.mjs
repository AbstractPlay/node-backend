import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { getPlayers } from '../players/getPlayers.js';
import { ensureMetaGameCountEntry } from '../metaGameBootstrap.js';
import { adjustShardedCounts } from '../gameProjector.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { stripColorFromSettings } from '../stripLegacyColorSettings.js';
import { normalizeAvatarInSettings } from '../dicebearAvatar.js';
import { feedbackNewKindsFromSettings, syncFeedbackNewNotifyIndex } from '../feedback/feedbackNewNotifyIndex.js';
import { syncAnnouncementNotifyIndex } from '../announcements/announcementNotifyIndex.js';

type FullGame = {
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; settings?: unknown }[];
};
`;

const body = slice(611, 875)
  .replace(/^async function toggleStar/, 'export async function toggleStar')
  .replace(/^async function injectState/, 'export async function injectState')
  .replace(/^async function updateGameSettings/, 'export async function updateGameSettings')
  .replace(/^async function updateUserSettings/, 'export async function updateUserSettings');

fs.writeFileSync(
  path.join(root, 'lib/games/playerSettings.ts'),
  `${header}\n${body}\n`,
  'utf8',
);
console.log('wrote lib/games/playerSettings.ts');
