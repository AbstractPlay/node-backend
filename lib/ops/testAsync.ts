import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';

function makeWork() {
  return new Promise<void>(function (resolve) {
    console.log('In makeWork');
    setTimeout(() => {
      console.log('End makeWork');
      resolve();
    }, 3000);
  });
}

/** Admin-only async smoke test (`test_async` auth query). */
export async function testAsync(userId: string, pars: { N: number }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'USER',
          sk: userId,
        },
      }),
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers,
      };
    }
    console.log(`Calling makeWork with ${pars.N}`);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    makeWork();
    console.log('Done calling makeWork');
    return {
      statusCode: 200,
      body: JSON.stringify({ n: pars.N }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to test_async ${userId}`);
  }
}
