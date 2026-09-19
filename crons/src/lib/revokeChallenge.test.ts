import { describe, expect, it } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { revokeChallengeRecord } from './revokeChallenge.js';

type StoredCommand = GetCommand | UpdateCommand | DeleteCommand;

function mockClient(
  botIds: Set<string> = new Set(),
): DynamoDBDocumentClient & { commands: StoredCommand[] } {
  const commands: StoredCommand[] = [];
  return {
    commands,
    async send(command: StoredCommand) {
      commands.push(command);
      if (command instanceof GetCommand) {
        const sk = command.input.Key?.sk;
        if (command.input.Key?.pk === 'BOT' && typeof sk === 'string' && botIds.has(sk)) {
          return { Item: { pk: 'BOT', sk } };
        }
        return {};
      }
      return {};
    },
  } as DynamoDBDocumentClient & { commands: StoredCommand[] };
}

describe('revokeChallengeRecord', () => {
  it('deletes standing challenge and updates issuer and counts', async () => {
    const client = mockClient();
    await revokeChallengeRecord(client, 'table', {
      id: 'c1',
      metaGame: 'chess',
      numPlayers: 2,
      challenger: { id: 'u1' },
      players: [{ id: 'u1' }, { id: 'u2' }],
    }, true);

    const deletes = client.commands.filter(c => c instanceof DeleteCommand);
    expect(deletes.some(c => c.input.Key?.pk === 'STANDINGCHALLENGE#chess')).toBe(true);
    expect(client.commands.some(c =>
      c instanceof UpdateCommand
      && c.input.UpdateExpression?.includes('challenges_standing'),
    )).toBe(true);
    expect(client.commands.some(c =>
      c instanceof UpdateCommand
      && c.input.UpdateExpression?.includes('challenges_accepted'),
    )).toBe(true);
  });

  it('deletes direct challenge and updates issued/received sets', async () => {
    const client = mockClient();
    await revokeChallengeRecord(client, 'table', {
      id: 'd1',
      metaGame: 'go',
      numPlayers: 2,
      challenger: { id: 'u1' },
      challengees: [{ id: 'u2' }],
      players: [{ id: 'u1' }],
    }, false);

    expect(client.commands.some(c =>
      c instanceof DeleteCommand && c.input.Key?.pk === 'CHALLENGE',
    )).toBe(true);
    expect(client.commands.some(c =>
      c instanceof UpdateCommand
      && c.input.UpdateExpression?.includes('challenges_issued'),
    )).toBe(true);
    expect(client.commands.some(c =>
      c instanceof UpdateCommand
      && c.input.UpdateExpression?.includes('challenges_received'),
    )).toBe(true);
  });
});
