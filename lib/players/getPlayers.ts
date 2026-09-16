import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import {
  isBotId,
  getBotRecord,
  botToFullUserStub,
} from '../participants.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import type { GetCommandOutput } from '@aws-sdk/lib-dynamodb';

export async function getPlayers(playerIDs: string[]): Promise<any[]> {
  const players: any[] = [];
  for (const id of playerIDs) {
    if (await isBotId(id)) {
      const bot = await getBotRecord(id);
      if (bot) {
        players.push(botToFullUserStub(bot));
      }
      continue;
    }
    const playerData = await sendCommandWithRetry<GetCommandOutput>(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'USER',
          sk: id,
        },
      }),
    );
    if (playerData.Item) {
      players.push(playerData.Item);
    }
  }
  return players;
}
