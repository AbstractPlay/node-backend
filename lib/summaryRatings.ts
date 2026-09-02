import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { UserGameRating } from './batchRatings.js';

const REC_BUCKET = 'records.abstractplay.com';
const SUMMARY_RATINGS_KEY = '_summary-ratings.json';
const SUMMARY_RATINGS_TTL_MS = 5 * 60 * 1000;

const s3 = new S3Client({ region: 'us-east-1' });

type SummaryRatingsCache = {
  highest: UserGameRating[];
  playerCountsByUid: Record<string, number>;
  loadedAt: number;
};

let cache: SummaryRatingsCache | undefined;

type SummaryRatingsTier = {
  tier?: string;
  generated?: string;
  ratings: {
    highest: UserGameRating[];
    playerCountsByUid?: Record<string, number>;
  };
};

async function loadSummaryRatingsCache(): Promise<SummaryRatingsCache> {
  if (cache !== undefined && Date.now() - cache.loadedAt < SUMMARY_RATINGS_TTL_MS) {
    return cache;
  }
  const response = await s3.send(new GetObjectCommand({
    Bucket: REC_BUCKET,
    Key: SUMMARY_RATINGS_KEY,
  }));
  const body = await response.Body?.transformToString();
  if (body === undefined) {
    throw new Error(`Unable to load s3://${REC_BUCKET}/${SUMMARY_RATINGS_KEY}`);
  }
  const parsed = JSON.parse(body) as SummaryRatingsTier;
  const highest = parsed.ratings?.highest;
  if (highest === undefined) {
    throw new Error(`Missing ratings.highest in ${SUMMARY_RATINGS_KEY}`);
  }
  cache = {
    highest,
    playerCountsByUid: parsed.ratings?.playerCountsByUid ?? {},
    loadedAt: Date.now(),
  };
  return cache;
}

export async function loadSummaryRatingsHighest(): Promise<UserGameRating[]> {
  return (await loadSummaryRatingsCache()).highest;
}

export async function loadSummaryPlayerCountsByUid(): Promise<Record<string, number>> {
  return (await loadSummaryRatingsCache()).playerCountsByUid;
}

export function setSummaryRatingsHighestForTests(highest: UserGameRating[]): void {
  cache = {
    highest,
    playerCountsByUid: cache?.playerCountsByUid ?? {},
    loadedAt: Date.now(),
  };
}

export function setSummaryRatingsCacheForTests(
  highest: UserGameRating[],
  playerCountsByUid: Record<string, number> = {},
): void {
  cache = {
    highest,
    playerCountsByUid,
    loadedAt: Date.now(),
  };
}

export function clearSummaryRatingsCacheForTests(): void {
  cache = undefined;
}
