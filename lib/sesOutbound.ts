import {
  SESClient,
  SendEmailCommand,
  type SendEmailCommandOutput,
  SendRawEmailCommand,
  type SendRawEmailCommandOutput,
} from '@aws-sdk/client-ses';

export type OutboundSesCommand = SendEmailCommand | SendRawEmailCommand;

export function sendOutboundSes(
  client: SESClient,
  command: OutboundSesCommand,
): Promise<SendEmailCommandOutput | SendRawEmailCommandOutput> {
  if (command instanceof SendRawEmailCommand) {
    return client.send(command);
  }
  return client.send(command);
}