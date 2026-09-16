import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';

export async function isFeedbackAdmin(userId: string): Promise<boolean> {
  const user = await ddbDocClient.send(new GetCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: 'USER', sk: userId },
  }));
  return user.Item?.admin === true;
}
