'use strict';

/**
 * Shared helpers for reading the daily DynamoDB ION export in S3.
 * Keep in sync with node-backend abandoned-account cleanup plan when changing dump selection.
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { gunzipSync, strFromU8 } from 'fflate';
import { load as loadIon } from 'ion-js';
import type { BasicRec } from '../types/index.js';

export const DUMP_BUCKET = 'abstractplay-db-dump';

export async function listDumpBucketObjects(s3: S3Client): Promise<_Object[]> {
  const command = new ListObjectsV2Command({ Bucket: DUMP_BUCKET });
  const allContents: _Object[] = [];
  let isTruncated = true;

  while (isTruncated) {
    const { Contents, IsTruncated, NextContinuationToken } = await s3.send(command);
    if (Contents === undefined) {
      throw new Error('Could not list dump bucket contents');
    }
    allContents.push(...Contents);
    isTruncated = IsTruncated ?? false;
    command.input.ContinuationToken = NextContinuationToken;
  }

  return allContents;
}

export function findLatestDumpUid(allContents: _Object[]): string {
  const manifests = allContents.filter(c => c.Key?.includes('manifest-summary.json'));
  manifests.sort((a, b) => b.LastModified!.toISOString().localeCompare(a.LastModified!.toISOString()));
  const latest = manifests[0];
  if (latest?.Key === undefined) {
    throw new Error('No manifest-summary.json found in dump bucket');
  }
  const match = latest.Key.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
  if (match === null) {
    throw new Error(`Could not extract uid from "${latest.Key}"`);
  }
  return match[1]!;
}

export function dumpDataFilesForUid(allContents: _Object[], uid: string): _Object[] {
  return allContents.filter(c => c.Key?.includes(`${uid}/data/`) && c.Key?.endsWith('.ion.gz'));
}

export async function forEachIonItem(
  s3: S3Client,
  file: _Object,
  onItem: (item: Record<string, unknown>) => void,
): Promise<void> {
  if (file.Key === undefined) {
    return;
  }
  const response = await s3.send(new GetObjectCommand({
    Bucket: DUMP_BUCKET,
    Key: file.Key,
  }));
  const bytes = await response.Body?.transformToByteArray();
  if (bytes === undefined) {
    throw new Error(`Could not load bytes from file ${file.Key}`);
  }

  const ion = gunzipSync(bytes);
  let sofar = '';
  let ptr = 0;
  const chunk = 1_000_000;
  while (ptr < ion.length) {
    sofar += strFromU8(ion.slice(ptr, ptr + chunk));
    while (sofar.includes('}}\n')) {
      const idx = sofar.indexOf('}}\n');
      const line = sofar.substring(0, idx + 2);
      sofar = sofar.substring(idx + 3);
      try {
        const outerRec = loadIon(line);
        if (outerRec === null) {
          continue;
        }
        const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
        onItem(json.Item as Record<string, unknown>);
      } catch {
        // skip malformed lines
      }
    }
    ptr += chunk;
  }
}

export async function collectUserCandidatesFromDump(
  s3: S3Client,
  allContents: _Object[],
  uid: string,
  inactiveBeforeMs: number,
): Promise<string[]> {
  const candidates = new Set<string>();
  const dataFiles = dumpDataFilesForUid(allContents, uid);

  for (const file of dataFiles) {
    await forEachIonItem(s3, file, item => {
      if (item.pk !== 'USER' || typeof item.sk !== 'string') {
        return;
      }
      if (item.cleaned === true) {
        return;
      }
      const lastSeen = item.lastSeen;
      if (typeof lastSeen !== 'number' || lastSeen >= inactiveBeforeMs) {
        return;
      }
      candidates.add(item.sk);
    });
  }

  return [...candidates];
}
