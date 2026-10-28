import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { getArenaTimeControl } from './timeControls.js';

const NAMESPACE = 'AbstractPlay/Arena';
const client = new CloudWatchClient({});

function stageDimension(): string {
  const table = process.env.ABSTRACT_PLAY_TABLE ?? '';
  if (table.endsWith('-prod')) {
    return 'prod';
  }
  if (table.endsWith('-dev')) {
    return 'dev';
  }
  return process.env.WEBSOCKET_STAGE ?? 'unknown';
}

/** Best-effort CloudWatch metrics for arena move timing (S5 observability). */
export async function publishArenaMoveMetrics(fields: {
  arenaTcId?: string;
  processingMs?: number;
  ootRejected?: boolean;
}): Promise<void> {
  const tc = fields.arenaTcId ? getArenaTimeControl(fields.arenaTcId) : undefined;
  const tier = tc?.tier ?? 'unknown';
  const stage = stageDimension();
  const dimensions = [
    { Name: 'tier', Value: tier },
    { Name: 'stage', Value: stage },
  ];

  const metricData: {
    MetricName: string;
    Value: number;
    Unit: 'Milliseconds' | 'Count';
    Dimensions: { Name: string; Value: string }[];
  }[] = [];

  if (fields.processingMs !== undefined && fields.ootRejected !== true) {
    metricData.push({
      MetricName: 'ArenaMoveProcessingMs',
      Value: fields.processingMs,
      Unit: 'Milliseconds',
      Dimensions: dimensions,
    });
  }
  if (fields.ootRejected === true) {
    metricData.push({
      MetricName: 'ArenaMoveOotReject',
      Value: 1,
      Unit: 'Count',
      Dimensions: dimensions,
    });
  }

  if (metricData.length === 0) {
    return;
  }

  try {
    await client.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: metricData,
    }));
  } catch (err) {
    console.error('Failed to publish arena move metrics:', err);
  }
}
