import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { LadderReconcileReport } from '@backend/lib/ladders/reconcileActiveCounts.js';

const REGION = 'us-east-1';
export const LADDER_OPS_BUCKET = 'private-ops-153672715141-us-east-1-an';
const RECONCILE_PREFIX = 'ladders/reconcile';

const s3 = new S3Client({ region: REGION });

export async function writeLadderReconcileReport(
  report: LadderReconcileReport,
  options: { writeS3: boolean },
): Promise<void> {
  if (!options.writeS3) {
    return;
  }
  const day = report.generatedAt.slice(0, 10);
  const body = JSON.stringify(report, null, 2);
  await s3.send(new PutObjectCommand({
    Bucket: LADDER_OPS_BUCKET,
    Key: `${RECONCILE_PREFIX}/daily/${day}.json`,
    Body: body,
    ContentType: 'application/json',
  }));
  await s3.send(new PutObjectCommand({
    Bucket: LADDER_OPS_BUCKET,
    Key: `${RECONCILE_PREFIX}/latest.json`,
    Body: body,
    ContentType: 'application/json',
  }));
}
