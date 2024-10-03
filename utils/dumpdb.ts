'use strict';

import { DynamoDBClient, ExportTableToPointInTimeCommand, type ExportTableToPointInTimeInput } from "@aws-sdk/client-dynamodb";
import { Handler } from "aws-lambda";

const REGION = "us-east-1";
const DUMP_BUCKET = "abstractplay-db-dump";
const ddbClient = new DynamoDBClient({ region: REGION });

export const handler: Handler = async (event: any, context?: any) => {
    const input: ExportTableToPointInTimeInput = {
        S3Bucket: DUMP_BUCKET,
        TableArn: "arn:aws:dynamodb:us-east-1:153672715141:table/abstract-play-prod",
        ExportFormat: "ION",
    }
    const cmd = new ExportTableToPointInTimeCommand(input);

    try {
        const response = await ddbClient.send(cmd);
        console.log(`Export command sent:\n${JSON.stringify(response, null, 2)}`)
    } catch (err) {
        console.log(err)
    }
    console.log("ALL DONE");
};
