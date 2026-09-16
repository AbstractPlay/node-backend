import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const lines = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const s = (a, b) => lines.slice(a - 1, b).join('\n');

const header = `import { CreateUserPoolClientCommand, DeleteUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';
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
import { checkAboutSaveAllowed } from '../aboutSaves.js';
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
    return { statusCode: 409, body: JSON.stringify({ message: error.message }), headers };
  }
  if (error instanceof BotNameValidationError) {
    return { statusCode: 400, body: JSON.stringify({ message: error.message }), headers };
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

`;

let body = `${s(1799, 1809).replace(/^async function loadAboutSaveState/, 'async function loadAboutSaveState')}\n\n`;
body += `${s(1213, 1240)}\n\n`;
body += `${s(1242, 1298)}\n\n`;
body += s(956, 1211)
  .replace(/^async function createBot/, 'export async function createBot')
  .replace(/^async function updateBot/, 'export async function updateBot');
body += `\n\n${s(1300, 1478)
  .replace(/^async function beginBotSecretRotation/, 'export async function beginBotSecretRotation')
  .replace(/^async function finalizeBotSecretRotation/, 'export async function finalizeBotSecretRotation')
  .replace(/^async function deleteBot/, 'export async function deleteBot')}`;

fs.writeFileSync(path.join(root, 'lib/bots/crud.ts'), `${header}${body}\n`);
console.log('fixed crud.ts');
