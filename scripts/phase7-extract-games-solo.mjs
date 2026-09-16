import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers } from '../api/http.js';
import type { User } from '../api/types.js';
import { getParticipants } from '../participants.js';
import { prepareGameStateForStorage } from '../gameState.js';
import {
  buildStartSoloGame,
  normalizeSoloClocks,
  soloPlaySupported,
} from '../soloGame.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';
import {
  enqueueGameStartNotifications,
  inAppSettingsMapFromUsers,
} from '../notifications.js';
`;

const body = slice(900, 1017)
  .replace(/^async function startSoloGame/, 'export async function startSoloGame');

fs.writeFileSync(
  path.join(root, 'lib/games/solo.ts'),
  `${header}\n${body}\n`,
  'utf8',
);
console.log('wrote lib/games/solo.ts');
