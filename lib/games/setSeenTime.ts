import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { logGetItemError } from '../api/http.js';
import { shouldWriteGameOpenOverlay } from '../dashboardGames.js';
import { upsertUserGameOverlay } from '../userGameOverlay.js';

type FullUser = {
  id: string;
};

export async function setSeenTime(userid: string, gameid: string) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          pk: 'USER',
          sk: userid,
        },
      }));
    if (userData.Item === undefined) {
      throw new Error(`setSeenTime, no user?? ${userid}`);
    }
  } catch (err) {
    logGetItemError(err);
    throw new Error(`setSeenTime, no user?? ${userid}`);
  }

  const mayWriteOverlay = await shouldWriteGameOpenOverlay(
    ddbDocClient,
    tableName,
    userid,
    gameid,
  );
  if (!mayWriteOverlay) {
    return;
  }

  const now = Date.now();
  await upsertUserGameOverlay(
    ddbDocClient,
    tableName,
    userid,
    gameid,
    { seen: now },
  );
}
