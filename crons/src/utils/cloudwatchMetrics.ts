import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const NAMESPACE = "AbstractPlay/Thumbnails";
const client = new CloudWatchClient({});

/** Publish a single count metric (best-effort; logs on failure). */
export async function putThumbnailMetric(
    name: string,
    value: number,
    dimensions: Record<string, string> = {},
): Promise<void> {
    try {
        await client.send(
            new PutMetricDataCommand({
                Namespace: NAMESPACE,
                MetricData: [
                    {
                        MetricName: name,
                        Value: value,
                        Unit: "Count",
                        Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
                            Name,
                            Value,
                        })),
                    },
                ],
            }),
        );
    } catch (err) {
        console.error(`Failed to publish CloudWatch metric ${name}:`, err);
    }
}
