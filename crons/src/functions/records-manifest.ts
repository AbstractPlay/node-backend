'use strict';

import { S3Client, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { REC_BUCKET } from "../constants/recordsBucket.js";
import { buildRecordsManifest } from "../utils/recordsManifest.js";
import { putRecordsJson, RECORDS_MANIFEST_CACHE_CONTROL } from "../utils/recordsJson.js";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});

export const handler: Handler = async (event: any, context?: any) => {
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
        throw err;
    }

    const generated = new Date().toISOString();
    const manifest = buildRecordsManifest(recList, generated);
    await putRecordsJson(s3, "_manifest.json", manifest, {
        cacheControl: RECORDS_MANIFEST_CACHE_CONTROL,
    });
    console.log(`Manifest v${manifest.version} generated (${recList.length} objects)`);

    console.log("ALL DONE");
};
