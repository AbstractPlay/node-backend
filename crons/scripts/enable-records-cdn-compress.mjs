import {
    CloudFrontClient,
    GetDistributionConfigCommand,
    UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";

const DISTRIBUTION_ID = "EM4FVU08T5188";
const REGION = "us-east-1";

const dryRun = process.argv.includes("--dry-run");

const client = new CloudFrontClient({ region: REGION });

const { DistributionConfig, ETag } = await client.send(
    new GetDistributionConfigCommand({ Id: DISTRIBUTION_ID }),
);

if (!DistributionConfig?.DefaultCacheBehavior) {
    throw new Error(`Distribution ${DISTRIBUTION_ID} has no default cache behavior`);
}

const updated = {
    ...DistributionConfig,
    DefaultCacheBehavior: {
        ...DistributionConfig.DefaultCacheBehavior,
        Compress: true,
    },
};

if (DistributionConfig.DefaultCacheBehavior.Compress === true) {
    console.log(`Distribution ${DISTRIBUTION_ID}: Compress already enabled on default behavior`);
    process.exit(0);
}

if (dryRun) {
    console.log(`[dry-run] Would enable Compress on distribution ${DISTRIBUTION_ID}`);
    process.exit(0);
}

await client.send(
    new UpdateDistributionCommand({
        Id: DISTRIBUTION_ID,
        IfMatch: ETag,
        DistributionConfig: updated,
    }),
);

console.log(`Enabled Compress objects automatically on distribution ${DISTRIBUTION_ID}`);
