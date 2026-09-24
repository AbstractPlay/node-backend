import {
    CloudFrontClient,
    CreateResponseHeadersPolicyCommand,
    GetDistributionConfigCommand,
    ListResponseHeadersPoliciesCommand,
    UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";

const DISTRIBUTION_ID = "EM4FVU08T5188";
const POLICY_NAME = "records-abstractplay-noindex";
const REGION = "us-east-1";

const dryRun = process.argv.includes("--dry-run");

const client = new CloudFrontClient({ region: REGION });

async function findPolicyIdByName(name) {
    let marker;
    do {
        const response = await client.send(
            new ListResponseHeadersPoliciesCommand({
                Type: "custom",
                Marker: marker,
            }),
        );
        const items = response.ResponseHeadersPolicyList?.Items ?? [];
        for (const item of items) {
            if (item.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name === name) {
                return item.ResponseHeadersPolicy?.Id;
            }
        }
        marker = response.ResponseHeadersPolicyList?.NextMarker;
    } while (marker);
    return undefined;
}

let policyId = await findPolicyIdByName(POLICY_NAME);

if (!policyId) {
    if (dryRun) {
        console.log(`[dry-run] Would create response headers policy ${POLICY_NAME}`);
    } else {
        const created = await client.send(
            new CreateResponseHeadersPolicyCommand({
                ResponseHeadersPolicyConfig: {
                    Name: POLICY_NAME,
                    Comment: "GSC: X-Robots-Tag noindex on records.abstractplay.com JSON API",
                    CustomHeadersConfig: {
                        Quantity: 1,
                        Items: [
                            {
                                Header: "X-Robots-Tag",
                                Value: "noindex",
                                Override: true,
                            },
                        ],
                    },
                },
            }),
        );
        policyId = created.ResponseHeadersPolicy?.Id;
        if (!policyId) {
            throw new Error("CreateResponseHeadersPolicy did not return an Id");
        }
        console.log(`Created response headers policy ${POLICY_NAME} (${policyId})`);
    }
}

const { DistributionConfig, ETag } = await client.send(
    new GetDistributionConfigCommand({ Id: DISTRIBUTION_ID }),
);

if (!DistributionConfig?.DefaultCacheBehavior) {
    throw new Error(`Distribution ${DISTRIBUTION_ID} has no default cache behavior`);
}

const currentPolicyId = DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId;

if (policyId && currentPolicyId === policyId) {
    console.log(
        `Distribution ${DISTRIBUTION_ID}: already uses ${POLICY_NAME} (${policyId})`,
    );
    process.exit(0);
}

if (dryRun) {
    console.log(
        `[dry-run] Would attach response headers policy ${POLICY_NAME} to distribution ${DISTRIBUTION_ID}`,
    );
    process.exit(0);
}

if (!policyId) {
    throw new Error("Policy id missing after create (unexpected)");
}

await client.send(
    new UpdateDistributionCommand({
        Id: DISTRIBUTION_ID,
        IfMatch: ETag,
        DistributionConfig: {
            ...DistributionConfig,
            DefaultCacheBehavior: {
                ...DistributionConfig.DefaultCacheBehavior,
                ResponseHeadersPolicyId: policyId,
            },
        },
    }),
);

console.log(
    `Attached ${POLICY_NAME} (${policyId}) to distribution ${DISTRIBUTION_ID} default behavior`,
);
