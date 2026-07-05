import { CreateUserPoolClientCommandInput } from '@aws-sdk/client-cognito-identity-provider';

export function getBotOAuthScope(): string {
  const scope = process.env.BOT_OAUTH_SCOPE?.trim();
  if (!scope) {
    throw new Error('BOT_OAUTH_SCOPE environment variable is not set');
  }
  return scope;
}

export function buildCreateBotClientInput(
  userPoolId: string,
  cognitoClientName: string
): CreateUserPoolClientCommandInput {
  return {
    UserPoolId: userPoolId,
    ClientName: cognitoClientName,
    GenerateSecret: true,
    AllowedOAuthFlows: ['client_credentials'],
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthScopes: [getBotOAuthScope()],
    PreventUserExistenceErrors: 'ENABLED',
  };
}
