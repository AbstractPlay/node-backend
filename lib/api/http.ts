import { RECENT_COMPLETED_CACHE_TTL_MS } from '../recentCompletedGames.js';

export const corsHeaders = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

/** @deprecated Prefer `corsHeaders`; kept for incremental migration from abstractplay. */
export const headers = corsHeaders;

export const cachedListHeaders = {
  ...corsHeaders,
  'Cache-Control': `public, max-age=${Math.floor(RECENT_COMPLETED_CACHE_TTL_MS / 1000)}`,
};

export const feedbackListHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

export type LambdaHttpResponse = {
  statusCode: number;
  body: string;
  headers: typeof corsHeaders;
};

export function parseLambdaIntegrationBody(
  body: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (body === undefined || body === null) {
    throw new Error('Missing request body');
  }
  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>;
  }
  return body;
}

function clientErrorMessage(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  if (err.name === 'UserFacingError') {
    const ufe = err as Error & { client?: string };
    return ufe.client || err.message;
  }
  if (err.message === 'It is not your turn!') {
    return err.message;
  }
  return undefined;
}

export function formatReturnError(message: string, err?: unknown): LambdaHttpResponse {
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: clientErrorMessage(err) ?? message,
    }),
    headers: corsHeaders,
  };
}

export function logGetItemError(err: unknown): void {
  if (!err) {
    console.error('Encountered error object was empty');
    return;
  }
  if (!(err as { code: unknown }).code) {
    if (err instanceof Error) {
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${err.message}`);
      if (err.stack) {
        console.error('Stack trace:', err.stack);
      }
    } else {
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${JSON.stringify(err)}`);
    }
    return;
  }
  handleCommonErrors(err as { code: unknown; message: unknown });
}

export function handleCommonErrors(err: { code: unknown; message: unknown }): void {
  switch (err.code) {
    case 'InternalServerError':
      console.error(`Internal Server Error, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'ProvisionedThroughputExceededException':
      console.error(
        `Request rate is too high. If you're using a custom retry strategy make sure to retry with exponential back-off. `
          + `Otherwise consider reducing frequency of requests or increasing provisioned capacity for your table or secondary index. Error: ${err.message}`,
      );
      return;
    case 'ResourceNotFoundException':
      console.error(`One of the tables was not found, verify table exists before retrying. Error: ${err.message}`);
      return;
    case 'ServiceUnavailable':
      console.error(`Had trouble reaching DynamoDB. generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'ThrottlingException':
      console.error(`Request denied due to throttling, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'UnrecognizedClientException':
      console.error(
        `The request signature is incorrect most likely due to an invalid AWS access key ID or secret key, fix before retrying. `
          + `Error: ${err.message}`,
      );
      return;
    case 'ValidationException':
      console.error(
        `The input fails to satisfy the constraints specified by DynamoDB, `
          + `fix input before retrying. Error: ${err.message}`,
      );
      return;
    case 'RequestLimitExceeded':
      console.error(
        `Throughput exceeds the current throughput limit for your account, `
          + `increase account level throughput before retrying. Error: ${err.message}`,
      );
      return;
    default:
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${err.message}`);
  }
}
