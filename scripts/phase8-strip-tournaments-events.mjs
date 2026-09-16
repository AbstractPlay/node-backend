import fs from 'fs';
import path from 'path';

const filePath = path.join(path.resolve(import.meta.dirname, '..'), 'api/abstractplay.ts');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

const removeRanges = [
  [2318, 1095],
  [1091, 612],
  [526, 442],
];

let out = [...lines];
const sortedRanges = removeRanges
  .map(([a, b]) => ({ lo: Math.min(a, b), hi: Math.max(a, b) }))
  .sort((x, y) => y.lo - x.lo);
for (const { lo, hi } of sortedRanges) {
  out.splice(lo - 1, hi - lo + 1);
}

const phase5Marker = '/** Route dispatch — thin auth glue re-exported from lib (Phase 5). */';
const p5 = out.findIndex((l) => l === phase5Marker);
if (p5 === -1) {
  console.error('phase5 marker missing');
  process.exit(1);
}

let exportBrace = out.findIndex(
  (l, i) => i > p5 && l === '};' && out[i - 1]?.trim() === 'testAsync,',
);
if (exportBrace === -1) {
  console.error('export block end missing');
  process.exit(1);
}

const toRemove = new Set([
  'endATournament,',
  'eventClose,',
  'eventCreate,',
  'eventCreateGames,',
  'eventDelete,',
  'eventPublish,',
  'eventRegister,',
  'eventUpdateDesc,',
  'eventUpdateDivisions,',
  'eventUpdateInvites,',
  'eventUpdateName,',
  'eventUpdateResult,',
  'eventUpdateStart,',
  'eventWithdraw,',
  'joinTournament,',
  'newTournament,',
  'withdrawTournament,',
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
  endATournament,
  joinTournament,
  newTournament,
  withdrawTournament,
} from '../lib/tournaments/authHandlers.js';

export {
  eventClose,
  eventCreate,
  eventCreateGames,
  eventDelete,
  eventPublish,
  eventRegister,
  eventUpdateDesc,
  eventUpdateDivisions,
  eventUpdateInvites,
  eventUpdateName,
  eventUpdateResult,
  eventUpdateStart,
  eventWithdraw,
} from '../lib/events/authHandlers.js';
`;

out.splice(exportBrace + 1, 0, libExports);

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('phase8 strip lines', out.length);
