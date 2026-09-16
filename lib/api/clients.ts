import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient } from '@aws-sdk/client-ses';
import { SQSClient } from '@aws-sdk/client-sqs';

const REGION = 'us-east-1';

export const sesClient = new SESClient({ region: REGION });
export const s3Client = new S3Client({ region: REGION });
export const sqsClient = new SQSClient({ region: REGION });
export const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
