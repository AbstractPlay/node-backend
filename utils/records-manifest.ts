'use strict';

import { S3Client, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand, type CreateInvalidationCommandInput } from "@aws-sdk/client-cloudfront";
import { Handler } from "aws-lambda";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const REC_BUCKET = "records.abstractplay.com";
const cloudfront = new CloudFrontClient({region: REGION});

export const handler: Handler = async (event: any, context?: any) => {
    // generate file listing
    const recListCmd = new ListObjectsV2Command({
        Bucket: REC_BUCKET,
    });

    const recList: _Object[] = [];
    try {
        let isTruncatedOuter = true;

        while (isTruncatedOuter) {
            const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } =
            await s3.send(recListCmd);
            if (Contents === undefined) {
                throw new Error(`Could not list the bucket contents`);
            }
            recList.push(...Contents);
            isTruncatedOuter = IsTruncatedInner || false;
            recListCmd.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
    }
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `_manifest.json`,
        Body: JSON.stringify(recList),
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Manifest generated");

    // invalidate CloudFront distribution
    const cfParams: CreateInvalidationCommandInput = {
        DistributionId: "EM4FVU08T5188",
        InvalidationBatch: {
            CallerReference: Date.now().toString(),
            Paths: {
                Quantity: 1,
                Items: ["/*"],
            },
        },
    };
    const cfCmd = new CreateInvalidationCommand(cfParams);
    const cfResponse = await cloudfront.send(cfCmd);
    if (cfResponse["$metadata"].httpStatusCode !== 200) {
        console.log(cfResponse);
    }
    console.log("Invalidation sent");

    console.log("ALL DONE");
};
