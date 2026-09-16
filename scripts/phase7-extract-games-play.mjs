import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const typesBlock = [slice(369, 388), slice(390, 421), slice(437, 452)].join('\n\n');

const header = `/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type GetCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, type SendMessageRequest } from '@aws-sdk/client-sqs';
import {
  gameinfo,
  GameFactory,
  GameBase,
  GameBaseSimultaneous,
} from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient, sqsClient } from '../api/clients.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
  handleCommonErrors,
} from '../api/http.js';
import type { User, PartialClaims } from '../api/types.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import { effectiveFlags, flagSetIncludes, structuralFlags } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage, setGameEndedFromEngine } from '../gameState.js';
import { adminDeleteGame } from '../adminDeleteGame.js';
import { filterExplorationTreeForSave, type ExplorationTreeNode } from '../explorationMoves.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import { checkAndProcessGameTimeout } from '../dashboardMaintenance.js';
import {
  shouldWriteGameOpenOverlay,
} from '../dashboardGames.js';
import { upsertUserGameOverlay } from '../userGameOverlay.js';
import { checkInGameCommentAuth } from '../commentAuth.js';
import {
  countGameWatchers,
  updateLastChatForWatchers,
  updateWatcherSummaries,
  type GameMarkSummary,
} from '../playerGameMarks.js';
import {
  isBotId,
  getParticipants,
  getBotRecord,
  filterHumanIds,
  botToFullUserStub,
} from '../participants.js';
import { enqueueBotOutbound, getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { notifyRegisteredBotsTurn } from '../bots/notifyTurn.js';
import { realPingBot } from '../bots/realPingBot.js';
import { getPlayers } from '../players/getPlayers.js';
import { timeloss } from './timeloss.js';
import { sendUserPush } from '../push/sendUserPush.js';
import {
  createNotification,
  enqueueCompletedGameChatNotifications,
  enqueueGameEndNotifications,
  collectGameEndScoresFromEngine,
  formatNotificationScores,
  inAppSettingsMapFromUsers,
  optionalNotificationNote,
  type InAppNotificationUserSettings,
  type NotificationGame,
  type NotificationScore,
} from '../notifications.js';
import {
  queryRecentCompletedGames,
  updateCompletedGameCommentedFlag,
} from '../recentCompletedGames.js';
import { setSeenTime } from './setSeenTime.js';
import { wsBroadcast } from '../wsBroadcast.js';

`;

let body = [typesBlock, slice(423, 435), slice(623, 2085)].join('\n\n');

body = body
  .replace(/^async function inAppSettingsMapForUserIds/, 'async function inAppSettingsMapForUserIds')
  .replace(/^async function submitMove/, 'export async function submitMove')
  .replace(/^async function botMove/, 'export async function botMove')
  .replace(/^async function checkForAbandonedGame/, 'export async function checkForAbandonedGame')
  .replace(/^async function checkForTimeloss/, 'export async function checkForTimeloss')
  .replace(/^async function submitComment/, 'export async function submitComment')
  .replace(/^async function saveExploration/, 'export async function saveExploration')
  .replace(/^async function getExploration/, 'export async function getExploration')
  .replace(/^async function getPrivateExploration/, 'export async function getPrivateExploration')
  .replace(/^async function markAsPublished/, 'export async function markAsPublished')
  .replace(/^async function handleMove/, 'export async function handleMove')
  .replace(/\bsendPush\(/g, 'sendUserPush(');

const out = path.join(root, 'lib/games/playHandlers.ts');
fs.writeFileSync(out, `${header}${body}\n`, 'utf8');
console.log('wrote', out, 'lines', body.split('\n').length);
