import { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  BotOutboundMessage,
  processBotChallengeMessage,
  processBotMoveMessage,
} from '../lib/botOutbound';

async function processRecord(record: SQSRecord): Promise<void> {
  let message: BotOutboundMessage;
  try {
    message = JSON.parse(record.body) as BotOutboundMessage;
  } catch (error) {
    console.error('Invalid bot outbound SQS message JSON', record.body, error);
    return;
  }

  if (message.type === 'challenge') {
    await processBotChallengeMessage(message);
    return;
  }
  if (message.type === 'move') {
    await processBotMoveMessage(message);
    return;
  }

  console.error('Unknown bot outbound message type', message);
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record);
  }
};
