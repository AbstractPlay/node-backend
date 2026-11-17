#!/usr/bin/env node
/**
 * Download latest abstractplay-db-dump ION export to a fixed, gitignored cache.
 *
 * Usage:
 *   npm run download-ion-dump
 *   npm run download-ion-dump -- --cache-dir .local/ion-dump
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadLatestIonDump } from './lib/ion-dump-reader.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE = join(repoRoot, '.local', 'ion-dump');

function parseArgs(argv) {
  const args = { cacheDir: DEFAULT_CACHE, profile: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cache-dir' && argv[i + 1]) {
      args.cacheDir = argv[++i];
    } else if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.error(`Usage: npm run download-ion-dump -- [--cache-dir .local/ion-dump] [--profile AbstractPlayProd]`);
      process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.profile) {
    process.env.AWS_PROFILE = args.profile;
  }
  await mkdir(args.cacheDir, { recursive: true });
  const { exportUid, dataDir } = await downloadLatestIonDump(args.cacheDir);
  const meta = {
    exportUid,
    dataDir,
    downloadedAt: new Date().toISOString(),
    cacheDir: args.cacheDir,
  };
  const metaPath = join(args.cacheDir, 'latest.json');
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${metaPath}`);
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});