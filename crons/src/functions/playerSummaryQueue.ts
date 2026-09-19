import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { PlayerSummaryQueueMessage } from "types/playerSummaryQueue.js";

export const SQS_SEND_BATCH_SIZE = 10;

export async function enqueuePlayerSummaryWrites(
    sqs: SQSClient,
    queueUrl: string,
    messages: PlayerSummaryQueueMessage[],
): Promise<void> {
    for (let i = 0; i < messages.length; i += SQS_SEND_BATCH_SIZE) {
        const batch = messages.slice(i, i + SQS_SEND_BATCH_SIZE);
        const response = await sqs.send(new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: batch.map((message, index) => ({
                Id: `${i + index}`,
                MessageBody: JSON.stringify(message),
            })),
        }));
        if (response.Failed !== undefined && response.Failed.length > 0) {
            throw new Error(
                `SQS SendMessageBatch failed: ${JSON.stringify(response.Failed)}`,
            );
        }
    }
}
