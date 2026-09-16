import { ddbDocClient } from '../ddb.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function sendCommandWithRetry<T = any>(
  command: any,
  maxRetries = 8,
  initialDelay = 100,
  maxDelay = 5000,
): Promise<T> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await ddbDocClient.send(command) as T;
    } catch (err: any) {
      const name = err?.name ?? '';
      if (
        ['ThrottlingException', 'ProvisionedThroughputExceededException', 'InternalServerError', 'ServiceUnavailable']
          .includes(name)
      ) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`Command failed after ${maxRetries} retries.`);
          throw err;
        }
        const delay = Math.min(initialDelay * Math.pow(2, retries - 1), maxDelay);
        const jitter = delay * 0.1 * Math.random();
        console.log(`Retryable error (${name}) caught. Retrying in ${Math.round(delay + jitter)}ms...`);
        await sleep(delay + jitter);
      } else {
        throw err;
      }
    }
  }
  // This should never be reached due to the throw in the catch block
  throw new Error(`Command failed after ${maxRetries} retries without a retryable error`);
}
