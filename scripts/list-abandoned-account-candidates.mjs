#!/usr/bin/env node
/**
 * List abandoned-account deletion candidates from a local or S3-downloaded ION dump.
 *
 * Read-only — no DynamoDB or Cognito.
 *
 * Usage:
 *   npm run list-abandoned-account-candidates -- --download
 *   npm run list-abandoned-account-candidates -- --dump-dir .local/abandoned-account-ion-dump/<uid>
 *   npm run list-abandoned-account-candidates -- --dump-dir ... --out bin/abandoned-account-candidates.json --csv
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAbandonedAccountDumpCollector,
  finalizeAbandonedAccountDumpCandidates,
  processAbandonedAccountDumpItem,
} from '../lib/abandonedAccountDumpCandidates.js';
import {
  downloadLatestIonDump,
  iterateIonDumpItems,
  resolveIonGzipPaths,
} from './lib/ion-dump-reader.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE = join(repoRoot, '.local', 'abandoned-account-ion-dump');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function usage() {
  console.error(`Usage: npm run list-abandoned-account-candidates -- [options]

Options:
  --download                 Download latest abstractplay-db-dump export
  --dump-dir <path>          Local export root, data/, or .ion.gz (required unless --download)
  --cache-dir <path>         Download target (default: ${DEFAULT_CACHE})
  --inactive-days <n>        Inactivity threshold (default: 365)
  --out <path>               Write JSON report (candidates + _summary)
  --csv                      With --out, also write .csv beside JSON path
  --include-deferred         Tag open-challenge involvement on candidates (informational)
  --help                     Show help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    download: false,
    dumpDir: '',
    cacheDir: DEFAULT_CACHE,
    inactiveDays: 365,
    out: '',
    csv: false,
    includeDeferred: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--download') {
      args.download = true;
    } else if (arg === '--dump-dir' && argv[i + 1]) {
      args.dumpDir = argv[++i];
    } else if (arg === '--cache-dir' && argv[i + 1]) {
      args.cacheDir = argv[++i];
    } else if (arg === '--inactive-days' && argv[i + 1]) {
      args.inactiveDays = Number(argv[++i]);
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg === '--csv') {
      args.csv = true;
    } else if (arg === '--include-deferred') {
      args.includeDeferred = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  return args;
}

async function runCollector(gzipPaths, inactiveBeforeMs, includeDeferred) {
  const state = createAbandonedAccountDumpCollector();
  await iterateIonDumpItems(gzipPaths, item => {
    processAbandonedAccountDumpItem(state, item);
  });
  return finalizeAbandonedAccountDumpCandidates(state, inactiveBeforeMs, {
    trackOpenChallengeDefer: includeDeferred,
  });
}

function printSummary(exportUid, result) {
  const { summary } = result;
  const inactiveIso = new Date(summary.inactiveBeforeMs).toISOString();
  console.log(`exportUid: ${exportUid ?? 'local'}`);
  console.log(`inactiveBefore: ${inactiveIso} (lastSeen must be older)`);
  console.log(`registeredHumans: ${summary.registeredHumans}`);
  console.log(`inactiveRegistered: ${summary.inactiveRegistered}`);
  console.log(`blockedCompleted (inactive users): ${summary.blockedCompleted}`);
  console.log(`blockedCurrent (inactive users): ${summary.blockedCurrent}`);
  console.log(`blockedGameRow (inactive users): ${summary.blockedGameRow}`);
  console.log(`gameBlockedUnique: ${summary.gameBlockedUnique}`);
  console.log(`candidates: ${summary.candidates}`);
  if (summary.wouldDeferOpenChallenge > 0) {
    console.log(`wouldDeferOpenChallenge: ${summary.wouldDeferOpenChallenge}`);
  }
  console.log(
    'Note: blocked* counts may overlap the same user; gameBlockedUnique is distinct inactive users with any game blocker.',
  );
}

function toCsv(candidates) {
  const header = 'userId,lastSeen,lastSeenIso,name,wouldDeferOpenChallenge';
  const lines = candidates.map(c => {
    const defer = c.wouldDeferOpenChallenge ? 'true' : 'false';
    const name = `"${String(c.name).replace(/"/g, '""')}"`;
    return `${c.userId},${c.lastSeen},${new Date(c.lastSeen).toISOString()},${name},${defer}`;
  });
  return [header, ...lines].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.download && !args.dumpDir) {
    usage();
  }

  const inactiveBeforeMs = Date.now() - args.inactiveDays * MS_PER_DAY;
  let exportUid = '';
  let gzipPaths;

  if (args.download) {
    await mkdir(args.cacheDir, { recursive: true });
    const downloaded = await downloadLatestIonDump(args.cacheDir);
    exportUid = downloaded.exportUid;
    gzipPaths = await resolveIonGzipPaths(join(args.cacheDir, exportUid));
  } else {
    gzipPaths = await resolveIonGzipPaths(args.dumpDir);
    const normalized = args.dumpDir.replace(/\\/g, '/');
    const match = normalized.match(/\/([0-9-]+T[0-9-]+Z)\/?/);
    exportUid = match?.[1] ?? '';
  }

  const result = await runCollector(gzipPaths, inactiveBeforeMs, args.includeDeferred);
  printSummary(exportUid, result);

  if (args.out) {
    const payload = {
      _summary: {
        exportUid: exportUid || undefined,
        ...result.summary,
        inactiveBeforeIso: new Date(result.summary.inactiveBeforeMs).toISOString(),
      },
      candidates: result.candidates,
    };
    await mkdir(dirname(args.out), { recursive: true }).catch(() => undefined);
    await writeFile(args.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${args.out}`);
    if (args.csv) {
      const csvPath = args.out.replace(/\.json$/i, '') + '.csv';
      await writeFile(csvPath, `${toCsv(result.candidates)}\n`, 'utf8');
      console.log(`Wrote ${csvPath}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
