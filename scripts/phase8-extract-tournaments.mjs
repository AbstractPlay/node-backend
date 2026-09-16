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
  type QueryCommandOutput,
  type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient } from '../api/clients.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
  handleCommonErrors,
} from '../api/http.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import type { User } from '../api/types.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import { getPlayers } from '../players/getPlayers.js';
import { createNotification } from '../notifications.js';
import { sendUserPush } from '../push/sendUserPush.js';

${slice(442, 490)}

`;

let body = slice(612, 1091);

const exportNames = [
  'newTournament',
  'joinTournament',
  'withdrawTournament',
  'endATournament',
  'endTournament',
];
for (const name of exportNames) {
  body = body.replace(new RegExp(`^async function ${name}`, 'm'), `export async function ${name}`);
}

body = body.replace(/\bsendPush\(/g, 'sendUserPush(');

const out = path.join(root, 'lib/tournaments/authHandlers.ts');
fs.writeFileSync(out, `${header}${body}\n`, 'utf8');
console.log('wrote', out);
