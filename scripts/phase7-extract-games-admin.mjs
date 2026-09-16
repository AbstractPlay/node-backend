import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { adminDeleteGame } from '../adminDeleteGame.js';
import { loadSummaryPlayerCountsByUid } from '../summaryRatings.js';
import { hasCurrentGameRow } from '../dashboardGames.js';
import { upsertUserGameOverlay } from '../userGameOverlay.js';
import { setWatchedSeen } from '../playerGameMarks.js';
import { updateCompletedGameCommentedFlag } from '../recentCompletedGames.js';

type FullUser = {
  id: string;
  name: string;
  email: string;
  admin?: boolean;
  stars?: string[];
  settings?: import('../api/types.js').UserSettings;
};

type Note = {
  pk: string;
  sk: string;
  note: string;
};

`;

let body = [
  slice(4279, 4289),
  '\n',
  slice(3796, 3855),
  '\n',
  slice(3993, 4148),
  '\n',
  slice(4151, 4222),
  '\n',
  slice(4291, 4440),
  '\n',
  slice(4443, 4459),
].join('\n');

body = body
  .replace(/^async function deleteGames/m, 'export async function deleteGames')
  .replace(/^async function updateNote/m, 'export async function updateNote')
  .replace(/^async function updateCommented/m, 'export async function updateCommented')
  .replace(/^async function setLastSeen/m, 'export async function setLastSeen')
  .replace(/^async function onetimeFix/m, 'export async function onetimeFix')
  .replace(/^async function fixGames/m, 'export async function fixGames')
  .replace(/^async function purgeRetiredCompletedGames/m, 'export async function purgeRetiredCompletedGames')
  .replace(/^async function updateMetaGameCounts/m, 'export async function updateMetaGameCounts');

const out = path.join(root, 'lib/games/adminHandlers.ts');
fs.writeFileSync(out, `${header}${body}\n`, 'utf8');
console.log('wrote', out);
