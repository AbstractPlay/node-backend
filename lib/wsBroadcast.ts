import { SQSClient, SendMessageCommand, SendMessageCommandOutput, SendMessageRequest } from "@aws-sdk/client-sqs";

const REGION = "us-east-1";
const sqsClient = new SQSClient({ region: REGION });

type WsMsgBody = {
  domainName: string;
  stage: string;
  verb: string;
  payload?: any;
  exclude?: string[];
};

export async function wsBroadcast (verb: string, payload: any, exclude?: string[]): Promise<SendMessageCommandOutput> {
    // construct message
    const body: WsMsgBody = {
        domainName: process.env.WEBSOCKET_DOMAIN!,
        stage: process.env.WEBSOCKET_STAGE!,
        verb,
        payload,
        exclude,
    }
    const input: SendMessageRequest = {
        QueueUrl: process.env.WEBSOCKET_SQS,
        MessageBody: JSON.stringify(body),
    }
    const cmd = new SendMessageCommand(input);
    return sqsClient.send(cmd);
}
