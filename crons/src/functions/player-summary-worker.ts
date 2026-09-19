import { S3Client } from "@aws-sdk/client-s3";
import type { SQSHandler } from "aws-lambda";
import type { PlayerSummaryQueueMessage } from "types/playerSummaryQueue.js";
import { putRecordsJson } from "../utils/recordsJson.js";

const s3 = new S3Client({ region: "us-east-1" });

export const handler: SQSHandler = async (event) => {
    for (const record of event.Records) {
        const message = JSON.parse(record.body) as PlayerSummaryQueueMessage;
        const bytes = await putRecordsJson(s3, message.key, message.slice);
        console.log(`Wrote ${message.key} (${bytes} bytes)`);
    }
};
