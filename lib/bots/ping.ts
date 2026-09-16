import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { sendUserPush } from '../push/sendUserPush.js';
import { realPingBot } from './realPingBot.js';

export async function testPush(userId: string) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to testPush ${userId}`);
  }

  await sendUserPush({
    userId,
    title: "Test",
    body: "Testing 1...2...3...",
    topic: "test",
    url: "/about",
  });
}

export async function pingBot(userId: string, pars: { metaGame: string, gameid: string }) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to testPush ${userId}`);
  }

  await realPingBot(pars.metaGame, pars.gameid);

  return {
    statusCode: 200,
    body: JSON.stringify({}),
    headers
  };
}
