import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient } from '../api/clients.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { User } from '../api/types.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import { effectiveFlags, applyPerspectivePlayerRotations } from '../effectiveGameFlags.js';
import { adjustShardedCounts } from '../gameProjector.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import {
  isBotId,
  getParticipants,
  filterHumanIds,
} from '../participants.js';
import { enqueueBotOutbound } from '../botOutbound.js';
import { notifyRegisteredBotsTurn } from '../bots/notifyTurn.js';
import { realPingBot } from '../bots/realPingBot.js';
import { getPlayers } from '../players/getPlayers.js';
import { declinesDirectChallenges } from '../challenges.js';
import { validateChallengeVariantUids } from './variantUids.js';
import { shuffle } from './shuffle.js';
import { getChallenges } from '../profile/me.js';
import { loadDashboardGames } from '../dashboardGames.js';
import { sendUserPush } from '../push/sendUserPush.js';
import {
  createNotification,
  enqueueGameStartNotifications,
  inAppSettingsMapFromUsers,
  optionalNotificationNote,
  type InAppNotificationUserSettings,
} from '../notifications.js';

type Challenge = {
  metaGame: string;
  standing?: boolean;
  challenger: User;
  players: User[];
  challengees?: User[];
};

type FullChallenge = {
  pk?: string;
  sk?: string;
  metaGame: string;
  numPlayers: number;
  standing?: boolean;
  duration?: number;
  seating: string;
  variants: string[];
  challenger: User;
  challengees?: User[];
  players?: User[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  comment?: string;
  dateIssued?: number;
};

type FullUser = {
  id: string;
  name: string;
  email: string;
  settings: import('../api/types.js').UserSettings;
  challenges_received?: Set<string>;
};
`;

let body = [
  slice(1019, 1863),
  '\n',
  slice(5393, 5493),
].join('\n');

body = body
  .replace(/^async function newChallenge/, 'export async function newChallenge')
  .replace(/^async function revokeChallenge/, 'export async function revokeChallenge')
  .replace(/^async function respondedChallenge/, 'export async function respondedChallenge')
  .replace(/\bsendPush\(/g, 'sendUserPush(');

const botRespond = slice(883, 897)
  .replace(/^export async function botRespondToChallenge/, 'export async function botRespondToChallenge');

const outPath = path.join(root, 'lib/challenges/authHandlers.ts');
fs.writeFileSync(outPath, `${header}\n${body}\n\n${botRespond}\n`, 'utf8');
console.log('wrote', outPath, 'lines', body.split('\n').length + botRespond.split('\n').length);
