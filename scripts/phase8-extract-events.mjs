import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  gameinfo,
  GameFactory,
  GameBase,
  GameBaseSimultaneous,
} from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import type { User } from '../api/types.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { effectiveFlags, applyPerspectivePlayerRotations } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { getPlayers } from '../players/getPlayers.js';
import { inAppSettingsMapForUserIds } from '../games/playHandlers.js';
import {
  enqueueEventInvitationNotifications,
  enqueueGameStartNotifications,
  resolveEventInvitationNotifyIds,
  type NotificationGame,
} from '../notifications.js';

type FullUser = {
  id: string;
  name: string;
  email: string;
  admin?: boolean;
  organizer?: boolean;
  settings?: import('../api/types.js').UserSettings;
};

${slice(392, 422)}

${slice(492, 526)}

`;

let body = slice(1095, 2318);

const exportNames = [
  'eventCreate',
  'eventPublish',
  'eventDelete',
  'eventRegister',
  'eventWithdraw',
  'eventUpdateStart',
  'eventUpdateName',
  'eventUpdateDesc',
  'eventUpdateInvites',
  'eventUpdateResult',
  'eventUpdateDivisions',
  'eventCreateGames',
  'eventClose',
  'eventUpdates',
];
for (const name of exportNames) {
  body = body.replace(new RegExp(`^async function ${name}`, 'm'), `export async function ${name}`);
}

const out = path.join(root, 'lib/events/authHandlers.ts');
fs.writeFileSync(out, `${header}${body}\n`, 'utf8');
console.log('wrote', out);
