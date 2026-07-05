import {
  CognitoIdentityProviderClient,
  AddUserPoolClientSecretCommand,
  ListUserPoolClientSecretsCommand,
  DeleteUserPoolClientSecretCommand,
  ClientSecretDescriptorType,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION = 'us-east-1';
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

function getUserPoolId(): string {
  const userPoolId = process.env.BOTPOOL_ID;
  if (!userPoolId) {
    throw new Error('BOTPOOL_ID environment variable is not set');
  }
  return userPoolId;
}

function sortSecretsByCreateDate(secrets: ClientSecretDescriptorType[]): ClientSecretDescriptorType[] {
  return [...secrets].sort((a, b) => {
    const aTime = a.ClientSecretCreateDate?.getTime() ?? 0;
    const bTime = b.ClientSecretCreateDate?.getTime() ?? 0;
    return aTime - bTime;
  });
}

export async function listBotClientSecrets(clientId: string): Promise<ClientSecretDescriptorType[]> {
  const response = await cognitoClient.send(new ListUserPoolClientSecretsCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId,
  }));
  return sortSecretsByCreateDate(response.ClientSecrets ?? []);
}

export async function beginBotSecretRotation(clientId: string): Promise<{ clientSecretId: string; clientSecret: string }> {
  const secrets = await listBotClientSecrets(clientId);

  if (secrets.length === 0) {
    throw new Error('No client secrets found');
  }

  if (secrets.length === 2) {
    const newest = secrets[1];
    if (!newest.ClientSecretId) {
      throw new Error('Pending client secret is missing an identifier');
    }
    await cognitoClient.send(new DeleteUserPoolClientSecretCommand({
      UserPoolId: getUserPoolId(),
      ClientId: clientId,
      ClientSecretId: newest.ClientSecretId,
    }));
  }

  const response = await cognitoClient.send(new AddUserPoolClientSecretCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId,
  }));

  const descriptor = response.ClientSecretDescriptor;
  if (!descriptor?.ClientSecretId || !descriptor.ClientSecretValue) {
    throw new Error('Cognito did not return ClientSecretId or ClientSecret');
  }

  return {
    clientSecretId: descriptor.ClientSecretId,
    clientSecret: descriptor.ClientSecretValue,
  };
}

export async function finalizeBotSecretRotation(clientId: string): Promise<void> {
  const secrets = await listBotClientSecrets(clientId);

  if (secrets.length !== 2) {
    throw new Error('No secret rotation in progress');
  }

  const oldest = secrets[0];
  if (!oldest.ClientSecretId) {
    throw new Error('Oldest client secret is missing an identifier');
  }

  await cognitoClient.send(new DeleteUserPoolClientSecretCommand({
    UserPoolId: getUserPoolId(),
    ClientId: clientId,
    ClientSecretId: oldest.ClientSecretId,
  }));
}
