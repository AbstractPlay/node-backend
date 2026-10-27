/**
 * Stream-parse DynamoDB export ION lines from local .ion.gz files.
 * Same line-delimited format as crons records/*.ts consumers.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync, strFromU8 } from 'fflate';
import { load as loadIon } from 'ion-js';

const RECORD_SUFFIX = '}}\n';

/**
 * Resolve a user path to an array of absolute .ion.gz file paths.
 * Accepts: export root (…/AWSDynamoDB/{uid}/), …/data/, or a single .ion.gz file.
 */
export async function resolveIonGzipPaths(dumpPath) {
  const abs = resolve(dumpPath);
  const st = await stat(abs);
  if (st.isFile()) {
    if (!abs.endsWith('.ion.gz')) {
      throw new Error(`Expected .ion.gz file, got: ${abs}`);
    }
    return [abs];
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${abs}`);
  }

  const normalized = abs.replace(/\\/g, '/');
  const dataDir = normalized.endsWith('/data') ? abs : join(abs, 'data');
  let entries;
  try {
    entries = await readdir(dataDir);
  } catch {
    entries = await readdir(abs);
    const fromRoot = entries.filter((n) => n.endsWith('.ion.gz')).map((n) => join(abs, n));
    if (fromRoot.length > 0) {
      return fromRoot.sort();
    }
    throw new Error(`No data/*.ion.gz under ${abs} or ${dataDir}`);
  }
  const files = entries
    .filter((n) => n.endsWith('.ion.gz'))
    .map((n) => join(dataDir, n))
    .sort();
  if (files.length === 0) {
    throw new Error(`No .ion.gz files in ${dataDir}`);
  }
  return files;
}

/** Parse one .ion.gz without building a single decompressed string (V8 max string size). */
async function iterateIonGzipFile(filePath, onItem) {
  const bytes = await readFile(filePath);
  const ion = gunzipSync(bytes);
  let sofar = '';
  let ptr = 0;
  const chunk = 1_000_000;
  while (ptr < ion.length) {
    sofar += strFromU8(ion.subarray(ptr, Math.min(ptr + chunk, ion.length)));
    ptr += chunk;
    while (sofar.includes(RECORD_SUFFIX)) {
      const idx = sofar.indexOf(RECORD_SUFFIX);
      const line = sofar.substring(0, idx + 2);
      sofar = sofar.substring(idx + 3);
      try {
        const outerRec = loadIon(line);
        if (outerRec === null) {
          continue;
        }
        const json = JSON.parse(JSON.stringify(outerRec));
        const item = json.Item;
        if (item && typeof item === 'object') {
          await onItem(item);
        }
      } catch (err) {
        console.warn(`ION parse skip in ${filePath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

/**
 * @param {string[]} gzipPaths
 * @param {(item: Record<string, unknown>) => void | Promise<void>} onItem — Dynamo Item (pk/sk/…)
 */
export async function iterateIonDumpItems(gzipPaths, onItem) {
  for (const filePath of gzipPaths) {
    console.log(`Reading ${filePath}`);
    await iterateIonGzipFile(filePath, onItem);
  }
}

/**
 * Download latest export data/*.ion.gz from abstractplay-db-dump into cacheDir.
 * @returns {Promise<{ exportUid: string, dataDir: string }>}
 */
export async function downloadLatestIonDump(cacheDir, { region = 'us-east-1' } = {}) {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const DUMP_BUCKET = 'abstractplay-db-dump';
  const s3 = new S3Client({ region });
  const allContents = [];
  const command = new ListObjectsV2Command({ Bucket: DUMP_BUCKET });
  let truncated = true;
  while (truncated) {
    const res = await s3.send(command);
    if (res.Contents) {
      allContents.push(...res.Contents);
    }
    truncated = res.IsTruncated ?? false;
    command.input.ContinuationToken = res.NextContinuationToken;
  }

  const manifests = allContents.filter((c) => c.Key?.includes('manifest-summary.json'));
  manifests.sort((a, b) => {
    const bMod = b.LastModified?.toISOString() ?? '';
    const aMod = a.LastModified?.toISOString() ?? '';
    return bMod.localeCompare(aMod);
  });
  const latest = manifests[0];
  if (!latest?.Key) {
    throw new Error('No manifest-summary.json in dump bucket');
  }
  const match = latest.Key.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
  if (!match) {
    throw new Error(`Unexpected manifest key: ${latest.Key}`);
  }
  const exportUid = match[1];
  const dataFiles = allContents.filter(
    (c) => c.Key?.includes(`${exportUid}/data/`) && c.Key?.endsWith('.ion.gz'),
  );
  const dataDir = join(cacheDir, exportUid, 'data');
  await mkdir(dataDir, { recursive: true });

  for (const file of dataFiles) {
    const key = file.Key;
    if (!key) {
      continue;
    }
    const name = key.split('/').pop();
    if (!name) {
      continue;
    }
    const dest = join(dataDir, name);
    const response = await s3.send(new GetObjectCommand({ Bucket: DUMP_BUCKET, Key: key }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Empty body for ${key}`);
    }
    await writeFile(dest, bytes);
    console.log(`Downloaded ${key} → ${dest}`);
  }

  return { exportUid, dataDir };
}
