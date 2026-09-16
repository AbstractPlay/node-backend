import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const ap = fs.readFileSync(path.join(root, 'api/abstractplay.ts'), 'utf8').split(/\r?\n/);
const playPath = path.join(root, 'lib/games/playHandlers.ts');
let play = fs.readFileSync(playPath, 'utf8');

const invokePie = ap.slice(3859, 3991).join('\n').replace(
  /^async function invokePie/,
  'export async function invokePie',
);

const botIdx = play.indexOf('async function botMove');
if (botIdx === -1) {
  console.error('botMove not found');
  process.exit(1);
}
play = `${play.slice(0, botIdx)}${invokePie}\n\n${play.slice(botIdx)}`;

const exportNames = [
  'submitMove',
  'botMove',
  'checkForAbandonedGame',
  'checkForTimeloss',
  'submitComment',
  'saveExploration',
  'getExploration',
  'getPrivateExploration',
  'markAsPublished',
  'handleMove',
];
for (const name of exportNames) {
  play = play.replace(new RegExp(`^async function ${name}`, 'm'), `export async function ${name}`);
}

play = play
  .replace(/\beventUpdates\(/g, 'callEventGameUpdater(')
  .replace(/\bendTournament\(/g, 'callTournamentDivisionCompleter(');

const extraTypes = `
type FullUser = {
  id: string;
  name: string;
  email: string;
  language?: string;
  settings?: import('../api/types.js').UserSettings;
  isBot?: boolean;
};

type Tournament = {
  divisions?: Record<string, { numCompleted: number; numGames: number; processed: boolean }>;
};

type Note = {
  pk: string;
  sk: string;
  note: string;
};
`;

const importPatch = `import type { PutCommandOutput, UpdateCommandOutput, DeleteCommandOutput } from '@aws-sdk/lib-dynamodb';
import { validateToken } from '@sunknudsen/totp';
import { getUsersLastSeen } from '../touchUserLastSeen.js';
import { hasCurrentGameRow } from '../dashboardGames.js';
import { setWatchedSeen } from '../playerGameMarks.js';
import { callEventGameUpdater, callTournamentDivisionCompleter } from './moveIntegration.js';
`;

play = play.replace(
  "import { wsBroadcast } from '../wsBroadcast.js';",
  `import { wsBroadcast } from '../wsBroadcast.js';\n${importPatch}\n${extraTypes}`,
);

fs.writeFileSync(playPath, play);
console.log('patched playHandlers.ts');
