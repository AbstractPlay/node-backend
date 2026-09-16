import fs from 'fs';
import path from 'path';

const filePath = path.join(path.resolve(import.meta.dirname, '..'), 'api/abstractplay.ts');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

/** Inclusive line ranges on pre-strip abstractplay.ts (descending start). */
const removeRanges = [
  [7269, 7274],
  [7195, 7257],
  [7162, 7193],
  [7089, 7120],
  [2392, 2419],
  [2357, 2374],
  [2330, 2355],
  [2171, 2328],
  [2135, 2169],
  [1480, 2133],
  [938, 1478],
  [588, 654],
];

let out = [...lines];
for (const [a, b] of removeRanges) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  out.splice(lo - 1, hi - lo + 1);
}

const marker = "import { timeloss } from '../lib/games/timeloss.js';";
const block = `${marker}
import { validateChallengeVariantUids } from '../lib/challenges/variantUids.js';
import { realPingBot } from '../lib/bots/realPingBot.js';
import { notifyRegisteredBotsTurn } from '../lib/bots/notifyTurn.js';
import { setToJSONReplacer } from '../lib/profile/setToJson.js';
const Set_toJSON = setToJSONReplacer;`;

const idx = out.findIndex((l) => l === marker);
if (idx === -1) {
  console.error('marker missing');
  process.exit(1);
}
out[idx] = block;

const movedFromLib = `
export {
  beginBotSecretRotation,
  createBot,
  deleteBot,
  finalizeBotSecretRotation,
  updateBot,
} from '../lib/bots/crud.js';

export { pingBot, testPush } from '../lib/bots/ping.js';

export {
  deleteCustomization,
  deletePush,
  meDashboard,
  meProfile,
  mySettings,
  newProfile,
  newSetting,
  nextGame,
  saveCustomization,
  savePush,
  saveTags,
  setPush,
} from '../lib/profile/me.js';

export {
  block_player,
  setPublicRivalries,
  unblock_player,
  updateStanding,
} from '../lib/profile/social.js';
`;

const phase5Marker = '/** Route dispatch — thin auth glue re-exported from lib (Phase 5). */';
const p5 = out.findIndex((l) => l === phase5Marker);
if (p5 === -1) {
  console.error('phase5 marker missing');
  process.exit(1);
}

let exportBrace = out.findIndex((l, i) => i > p5 && l === '};' && out[i - 1]?.trim().endsWith('withdrawTournament,'));
if (exportBrace === -1) {
  console.error('export block end missing');
  process.exit(1);
}

const toRemove = new Set([
  'beginBotSecretRotation,',
  'block_player,',
  'createBot,',
  'deleteBot,',
  'deleteCustomization,',
  'deletePush,',
  'finalizeBotSecretRotation,',
  'meDashboard,',
  'meProfile,',
  'mySettings,',
  'newProfile,',
  'newSetting,',
  'nextGame,',
  'pingBot,',
  'saveCustomization,',
  'savePush,',
  'saveTags,',
  'setPublicRivalries,',
  'setPush,',
  'testPush,',
  'unblock_player,',
  'updateBot,',
  'updateStanding,',
]);

for (let i = p5 + 1; i < exportBrace; i++) {
  const t = out[i].trim();
  if (toRemove.has(t)) {
    out.splice(i, 1);
    i--;
    exportBrace--;
  }
}

out.splice(exportBrace + 1, 0, movedFromLib);

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('phase6 strip lines', out.length);
