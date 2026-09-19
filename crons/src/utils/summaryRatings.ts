import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { REC_BUCKET, SUMMARY_RATINGS_KEY } from "../constants/recordsBucket.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";

const s3 = new S3Client({ region: "us-east-1" });

let cachedHighest: UserGameRating[] | undefined;
let cacheLoaded = false;

type SummaryRatingsTier = {
    tier?: string;
    generated?: string;
    ratings: {
        highest: UserGameRating[];
    };
};

export async function loadSummaryRatingsHighest(): Promise<UserGameRating[]> {
    if (cacheLoaded && cachedHighest !== undefined) {
        return cachedHighest;
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
    cachedHighest = highest;
    cacheLoaded = true;
    return highest;
}

/** @internal test helper */
export function clearSummaryRatingsCacheForTests(): void {
    cachedHighest = undefined;
    cacheLoaded = false;
}

export function setSummaryRatingsHighestForTests(highest: UserGameRating[]): void {
    cachedHighest = highest;
    cacheLoaded = true;
}
