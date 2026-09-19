'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESClient } from '@aws-sdk/client-ses';
import type { Handler } from 'aws-lambda';
import {
  discoverInactiveIssuerChallenges,
  isBotId,
  issuerStillInactive,
} from '../lib/inactiveChallengeDiscovery.js';
import { initApbackI18n } from '../lib/apbackI18n.js';
import {
  notifyChallengeRevokedAcceptors,
  toRevokeChallengeRecord,
} from '../lib/challengeRevokedNotifications.js';
import { pauseMatchingRealStandingEntries } from '../lib/pauseRealStanding.js';
import { revokeChallengeRecord } from '../lib/revokeChallenge.js';
import type { ChallengeForStandingMatch } from '../lib/standingChallengeMatch.js';

const REGION = 'us-east-1';
const DEFAULT_INACTIVE_MS = 14 * 24 * 60 * 60 * 1000;

type SkipReason =
  | 'issuer_active'
  | 'issuer_bot'
  | 'invalid_challenge'
  | 'error';

type Summary = {
  inactiveUsers: number;
  openChallengesScanned: number;
  candidates: number;
  revokedStanding: number;
  revokedDirect: number;
  pausedPresets: number;
  skipped: Record<SkipReason, number>;
  errors: { challengeId: string; message: string }[];
};

export const handler: Handler = async () => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (tableName === undefined) {
    throw new Error('ABSTRACT_PLAY_TABLE is required');
  }

  const inactiveMs = Number(process.env.INACTIVE_CHALLENGE_MS ?? DEFAULT_INACTIVE_MS);
  const batchSizeRaw = process.env.INACTIVE_CHALLENGE_REVOKE_BATCH_SIZE;
  const batchSize = batchSizeRaw === undefined || batchSizeRaw === ''
    ? Number.POSITIVE_INFINITY
    : Number(batchSizeRaw);
  const inactiveBeforeMs = Date.now() - inactiveMs;

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const ses = new SESClient({ region: REGION });
  await initApbackI18n();

  const summary: Summary = {
    inactiveUsers: 0,
    openChallengesScanned: 0,
    candidates: 0,
    revokedStanding: 0,
    revokedDirect: 0,
    pausedPresets: 0,
    skipped: {
      issuer_active: 0,
      issuer_bot: 0,
      invalid_challenge: 0,
      error: 0,
    },
    errors: [],
  };

  const discovery = await discoverInactiveIssuerChallenges(ddb, tableName, inactiveBeforeMs);
  summary.inactiveUsers = discovery.inactiveUsers;
  summary.openChallengesScanned = discovery.openChallengesScanned;
  summary.candidates = discovery.candidates.length;

  console.log(
    `inactive-challenge-cleanup: ${discovery.candidates.length} candidates `
    + `(${discovery.inactiveUsers} inactive issuers, ${discovery.openChallengesScanned} open challenges scanned)`,
  );

  let processed = 0;
  for (const candidate of discovery.candidates) {
    if (processed >= batchSize) {
      break;
    }
    try {
      if (await isBotId(ddb, tableName, candidate.issuerId)) {
        summary.skipped.issuer_bot += 1;
        continue;
      }
      if (!(await issuerStillInactive(ddb, tableName, candidate.issuerId, inactiveBeforeMs))) {
        summary.skipped.issuer_active += 1;
        continue;
      }

      const revokeRecord = toRevokeChallengeRecord(candidate.challenge);
      if (revokeRecord === undefined) {
        summary.skipped.invalid_challenge += 1;
        continue;
      }

      const standing = candidate.kind === 'standing';
      await revokeChallengeRecord(ddb, tableName, revokeRecord, standing);

      if (standing) {
        summary.pausedPresets += await pauseMatchingRealStandingEntries(
          ddb,
          tableName,
          candidate.issuerId,
          candidate.challenge as ChallengeForStandingMatch,
        );
      }

      if (standing) {
        summary.revokedStanding += 1;
      } else {
        summary.revokedDirect += 1;
      }
      processed += 1;

      try {
        await notifyChallengeRevokedAcceptors(ddb, tableName, ses, revokeRecord, standing);
      } catch (notifyErr) {
        console.error(
          `Revoked ${candidate.kind} challenge ${candidate.metaGame}#${candidate.id} but notifications failed:`,
          notifyErr,
        );
      }
    } catch (err) {
      summary.skipped.error += 1;
      summary.errors.push({
        challengeId: candidate.id,
        message: err instanceof Error ? err.message : String(err),
      });
      console.error(`Failed to revoke ${candidate.kind} challenge ${candidate.metaGame}#${candidate.id}:`, err);
    }
  }

  console.log('inactive-challenge-cleanup summary:', JSON.stringify(summary));
  return summary;
};
