import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

function write(rel, header, body) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${header}\n${body}\n`, 'utf8');
  console.log('wrote', rel);
}

const socialHeader = `import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError, handleCommonErrors } from '../api/http.js';

type StandingChallenge = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  limit: number;
  sensitivity: 'meta' | 'variants';
  suspended: boolean;
};

type StandingChallengeRec = {
  pk: 'REALSTANDING';
  sk: string;
  standing: StandingChallenge[];
};
`;

write(
  'lib/profile/social.ts',
  socialHeader,
  [
    slice(588, 619).replace(/^async function block_player/, 'export async function block_player'),
    slice(621, 649).replace(/^async function unblock_player/, 'export async function unblock_player'),
    slice(2135, 2169).replace(/^async function setPublicRivalries/, 'export async function setPublicRivalries'),
    slice(2330, 2355).replace(/^async function updateStanding/, 'export async function updateStanding'),
  ].join('\n\n'),
);

const botsHeader = `import { CreateUserPoolClientCommand, DeleteUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { cognitoClient } from '../api/clients.js';
import { headers, formatReturnError } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import { buildCreateBotClientInput } from '../botCognito.js';
import {
  BotNameTakenError,
  BotNameValidationError,
  releaseBotDisplayName,
  renameBotDisplayName,
  reserveBotDisplayName,
  validateBotDisplayName,
} from '../botNames.js';
import {
  beginBotSecretRotation as cognitoBeginBotSecretRotation,
  finalizeBotSecretRotation as cognitoFinalizeBotSecretRotation,
} from '../botSecrets.js';
import { validateAboutText } from '../aboutText.js';
import { checkAboutSaveAllowed, loadAboutSaveState } from '../aboutSaves.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';

type OwnedBotRecord = {
  pk: string;
  sk: string;
  owner: string;
  name: string;
  endpoint: string;
  pendingSecretId?: string;
  pendingSecretCreatedAt?: number;
};

function mapBotNameError(error: unknown) {
  if (error instanceof BotNameTakenError) {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: error.message }),
      headers,
    };
  }
  if (error instanceof BotNameValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error.message }),
      headers,
    };
  }
  return undefined;
}

function mapCognitoBotSecretError(error: any, action: string) {
  const name = error?.name ?? error?.__type;
  if (name === 'InvalidParameterException') {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error.message || 'Invalid parameter' }),
      headers,
    };
  }
  if (name === 'LimitExceededException') {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: error.message || 'Secret limit exceeded' }),
      headers,
    };
  }
  return formatReturnError(\`Unable to \${action}: \${error.message || error}\`);
}

async function loadOwnedBot(claim: PartialClaims, clientId: string | undefined) {
`;

let botsBody = slice(1242, 1298)
  .replace(/^async function loadOwnedBot/, '')
  + '\n'
  + slice(956, 1061).replace(/^async function createBot/, 'export async function createBot')
  + '\n'
  + slice(1063, 1211).replace(/^async function updateBot/, 'export async function updateBot')
  + '\n'
  + slice(1300, 1344).replace(/^async function beginBotSecretRotation/, 'export async function beginBotSecretRotation')
  + '\n'
  + slice(1346, 1382).replace(/^async function finalizeBotSecretRotation/, 'export async function finalizeBotSecretRotation')
  + '\n'
  + slice(1384, 1478).replace(/^async function deleteBot/, 'export async function deleteBot');

// Fix loadOwnedBot - the slice replacement broke structure; use full loadOwnedBot from file
botsBody = slice(938, 954) // mapBotNameError - already in header
  + '\n'
  + slice(1213, 1298).replace(/^type OwnedBotRecord[\s\S]*?^}\n\nfunction mapCognito/, 'function mapCognito')
  + '\n'
  + slice(1242, 1298).replace(/^async function loadOwnedBot/, 'async function loadOwnedBot')
  + '\n'
  + slice(956, 1478)
    .replace(/^async function createBot/, 'export async function createBot')
    .replace(/^async function updateBot/, 'export async function updateBot')
    .replace(/^async function beginBotSecretRotation/, 'export async function beginBotSecretRotation')
    .replace(/^async function finalizeBotSecretRotation/, 'export async function finalizeBotSecretRotation')
    .replace(/^async function deleteBot/, 'export async function deleteBot')
    .replace(/^type OwnedBotRecord[\s\S]*?^}\n\nfunction mapCognitoBotSecretError/, 'function mapCognitoBotSecretError')
    .replace(/^async function loadOwnedBot[\s\S]*?^}\n\nasync function beginBotSecretRotation/, 'async function beginBotSecretRotation');

write('lib/bots/crud.ts', botsHeader, botsBody);

write(
  'lib/bots/notifyTurn.ts',
  `import { gameinfo } from '@abstractplay/gameslib';
import { enqueueBotOutbound, getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { isBotId } from '../participants.js';

type FullGame = {
  metaGame: string;
  toMove: string | boolean[];
  players: { id: string }[];
};
`,
  slice(2357, 2374).replace(/^async function notifyRegisteredBotsTurn/, 'export async function notifyRegisteredBotsTurn'),
);

write(
  'lib/bots/realPingBot.ts',
  `import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, type SendMessageRequest } from '@aws-sdk/client-sqs';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { sqsClient } from '../api/clients.js';
import { formatReturnError, logGetItemError } from '../api/http.js';
import { hydrateGameState } from '../gameState.js';
import { notifyRegisteredBotsTurn } from './notifyTurn.js';

type FullGame = {
  metaGame: string;
  state: string;
  toMove: string | boolean[];
  players: { id: string }[];
};
`,
  slice(7195, 7257).replace(/^async function realPingBot/, 'export async function realPingBot'),
);

write(
  'lib/bots/ping.ts',
  `import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { sendUserPush } from '../push/sendUserPush.js';
import { realPingBot } from './realPingBot.js';
`,
  [
    slice(7089, 7120).replace(/^async function testPush/, 'export async function testPush'),
    slice(7162, 7193).replace(/^async function pingBot/, 'export async function pingBot'),
  ].join('\n\n'),
);

const meHeader = `import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import { setToJSONReplacer } from './setToJson.js';
import { getPlayerRelationIds } from '../playerRelations.js';
import { timeloss } from '../games/timeloss.js';
import {
  buildMeDashboardPayload,
  buildMeProfilePayload,
  type MeAncillaryData,
  type MeChallengeData,
} from '../meQuery.js';
import { listActiveGameKeys, loadDashboardGames } from '../dashboardGames.js';
import { runDashboardMaintenance } from '../dashboardMaintenance.js';
import { loadNotificationsForDashboard } from '../notifications.js';
import {
  deleteAllPushSubscriptions,
  deletePushSubscriptionByEndpoint,
  queryPushSubscriptions,
  savePushSubscription,
} from '../pushSubscriptions.js';
import { toClientBot, type BotRecord, type ClientBot } from '../participants.js';
import {
  listHighlights,
  listUserRecommendations,
  listWatchedGames,
} from '../playerGameMarks.js';
import { validateAboutText } from '../aboutText.js';
import { checkAboutSaveAllowed } from '../aboutSaves.js';
import { validateUserDisplayName } from '../userDisplayName.js';
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  isDisplayNameTaken,
} from '../displayNameAvailability.js';

type FullUser = {
  id: string;
  email?: string;
  name?: string;
  language?: string;
  cleaned?: boolean;
  bots?: Set<string>;
  challenges_issued?: Set<string>;
  challenges_received?: Set<string>;
  challenges_accepted?: Set<string>;
  challenges_standing?: Set<string>;
};

type Game = {
  players: { id: string; time?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
};

type TagList = { meta: string; tags: string[] };
type TagRec = { pk: 'TAG'; sk: string; tags: TagList[] };
type Customization = {
  colourContext: Record<string, string>;
  palette: string[];
  glyphmap?: unknown[];
  preferredColour?: string;
};
type CustomizationRec = { pk: string; sk: string; settings: Customization };

type StandingChallenge = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  limit: number;
  sensitivity: 'meta' | 'variants';
  suspended: boolean;
};

const Set_toJSON = setToJSONReplacer;
`;

const meBody = [
  slice(1480, 1618),
  slice(1620, 1747),
  slice(1749, 1761),
  slice(1763, 1797),
  slice(1799, 1809),
  slice(1811, 1883),
  slice(1885, 1982),
  slice(1984, 2031),
  slice(2033, 2105),
  slice(2107, 2133),
  slice(2171, 2328),
]
  .join('\n\n')
  .replace(/^async function loadMeUser/, 'async function loadMeUser')
  .replace(/^async function clearUserCleanedFlag/, 'async function clearUserCleanedFlag')
  .replace(/^async function resolveMeAncillary/, 'async function resolveMeAncillary')
  .replace(/^async function resolveMeChallenges/, 'async function resolveMeChallenges')
  .replace(/^async function meProfile/, 'export async function meProfile')
  .replace(/^async function meDashboard/, 'export async function meDashboard')
  .replace(/^async function nextGame/, 'export async function nextGame')
  .replace(/^async function updateUserEMail/, 'async function updateUserEMail')
  .replace(/^async function mySettings/, 'export async function mySettings')
  .replace(/^async function loadAboutSaveState/, 'async function loadAboutSaveState')
  .replace(/^async function saveUserAbout/, 'async function saveUserAbout')
  .replace(/^async function newSetting/, 'export async function newSetting')
  .replace(/^async function getChallenges/, 'async function getChallenges')
  .replace(/^async function getBots/, 'async function getBots')
  .replace(/^async function newProfile/, 'export async function newProfile')
  .replace(/^async function setPush/, 'export async function setPush')
  .replace(/^async function savePush/, 'export async function savePush')
  .replace(/^async function deletePush/, 'export async function deletePush')
  .replace(/^async function saveTags/, 'export async function saveTags')
  .replace(/^async function saveCustomization/, 'export async function saveCustomization')
  .replace(/^async function deleteCustomization/, 'export async function deleteCustomization');

write('lib/profile/me.ts', meHeader, meBody);

console.log('phase6 extract done');
