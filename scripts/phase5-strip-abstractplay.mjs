/**
 * Remove Phase 5 auth glue from abstractplay.ts; wire sendUserPush.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const filePath = path.join(root, 'api/abstractplay.ts');
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

const removeRanges = [
  [7617, 7629],
  [1822, 1840],
  [1802, 1820],
  [1787, 1800],
  [1765, 1785],
  [1569, 1591],
  [1545, 1567],
  [1521, 1543],
  [1497, 1519],
  [1474, 1495],
  [1450, 1472],
  [1443, 1448],
  [1421, 1441],
  [1399, 1419],
  [1080, 1397],
  [1012, 1014],
  [813, 1077],
  [802, 811],
  [656, 800],
  [654, 654],
];

let out = [...lines];
for (const [start, end] of removeRanges) {
  out.splice(start - 1, end - start + 1);
}

const sendPushMarker = 'async function sendPush(opts: PushOptions) {';
if (out.some((l) => l.includes(sendPushMarker))) {
  console.error('sendPush still present');
  process.exit(1);
}

const importMarker = "import { timeloss } from '../lib/games/timeloss.js';";
const importBlock = `${importMarker}
import { sendUserPush } from '../lib/push/sendUserPush.js';`;
const idx = out.findIndex((l) => l === importMarker);
if (idx === -1) {
  console.error('import marker not found');
  process.exit(1);
}
out[idx] = importBlock;

const sendPushFn = `async function sendPush(opts: PushOptions) {
  return sendUserPush(opts);
}`;
const typeGameMark = out.findIndex((l) => l.startsWith('type GameMarkPars'));
if (typeGameMark !== -1) {
  out.splice(typeGameMark, 1);
}

const toggleIdx = out.findIndex((l) => l.startsWith('async function toggleStar'));
if (toggleIdx !== -1) {
  out.splice(toggleIdx, 0, sendPushFn, '');
}

fs.writeFileSync(filePath, out.join('\n'), 'utf8');
console.log('stripped abstractplay.ts, lines', out.length);
