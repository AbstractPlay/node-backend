import fs from 'fs';
import path from 'path';

const filePath = path.join(path.resolve(import.meta.dirname, '..'), 'api/abstractplay.ts');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

const removeRanges = [
  [5393, 5493],
  [1019, 1863],
  [900, 1017],
  [883, 897],
  [611, 875],
];

let out = [...lines];
for (const [a, b] of removeRanges) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  out.splice(lo - 1, hi - lo + 1);
}

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
  'injectState,',
  'newChallenge,',
  'respondedChallenge,',
  'revokeChallenge,',
  'startSoloGame,',
  'toggleStar,',
  'updateGameSettings,',
  'updateUserSettings,',
]);

for (let i = p5 + 1; i < exportBrace; i++) {
  const t = out[i].trim();
  if (toRemove.has(t)) {
    out.splice(i, 1);
    i--;
    exportBrace--;
  }
}

const libExports = `
export {
  botRespondToChallenge,
  newChallenge,
  respondedChallenge,
  revokeChallenge,
} from '../lib/challenges/authHandlers.js';

export { startSoloGame } from '../lib/games/solo.js';

export {
  injectState,
  toggleStar,
  updateGameSettings,
  updateUserSettings,
} from '../lib/games/playerSettings.js';
`;

out.splice(exportBrace + 1, 0, libExports);

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('phase7 strip lines', out.length);
