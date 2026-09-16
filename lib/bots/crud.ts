import { CreateUserPoolClientCommand, DeleteUserPoolClientCommand } from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { cognitoClient } from '../api/clients.js';
import { headers, formatReturnError } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import { buildCreateBotClientInput } from '../botCognito.js';
import {
  BotNameTakenError,
  BotNameValidationError,
  releaseBotDisplayName,
  renameBotDisplayName,
  reserveBotDisplayName,
  validateBotDisplayName,
} from '../botNames.js';
import {
  beginBotSecretRotation as cognitoBeginBotSecretRotation,
  finalizeBotSecretRotation as cognitoFinalizeBotSecretRotation,
} from '../botSecrets.js';
import { validateAboutText } from '../aboutText.js';
import { checkAboutSaveAllowed } from '../aboutSaves.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';

type OwnedBotRecord = {
  pk: string;
  sk: string;
  owner: string;
  name: string;
  endpoint: string;
  pendingSecretId?: string;
  pendingSecretCreatedAt?: number;
};

function mapBotNameError(error: unknown) {
  if (error instanceof BotNameTakenError) {
    return { statusCode: 409, body: JSON.stringify({ message: error.message }), headers };
  }
  if (error instanceof BotNameValidationError) {
    return { statusCode: 400, body: JSON.stringify({ message: error.message }), headers };
  }
  return undefined;
}

function mapCognitoBotSecretError(error: any, action: string) {
  const name = error?.name ?? error?.__type;
  if (name === 'InvalidParameterException') {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error.message || 'Invalid parameter' }),
      headers,
    };
  }
  if (name === 'LimitExceededException') {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: error.message || 'Secret limit exceeded' }),
      headers,
    };
  }
  return formatReturnError(`Unable to ${action}: ${error.message || error}`);
}

async function loadAboutSaveState(userId: string) {
  const userData = await ddbDocClient.send(new GetCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE!,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'aboutSaveDay, aboutSaveCount',
  }));
  return {
    aboutSaveDay: userData.Item?.aboutSaveDay as string | undefined,
    aboutSaveCount: userData.Item?.aboutSaveCount as number | undefined,
  };
}

async function loadOwnedBot(claim: PartialClaims, clientId: string | undefined) {
  if (!claim || !claim.sub) {
    return {
      response: {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" }),
        headers
      }
    };
  }

  if (!clientId || clientId.trim().length === 0) {
    return {
      response: {
        statusCode: 400,
        body: JSON.stringify({ message: "A clientId is required to identify the bot" }),
        headers
      }
    };
  }

  try {
    const data = await ddbDocClient.send(new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));

    if (!data.Item) {
      return {
        response: {
          statusCode: 404,
          body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
          headers
        }
      };
    }

    const bot = data.Item as OwnedBotRecord;
    if (bot.owner !== claim.sub) {
      return {
        response: {
          statusCode: 403,
          body: JSON.stringify({ message: "You are not the owner of this bot" }),
          headers
        }
      };
    }

    return { bot };
  } catch (error: any) {
    console.error("Error loading bot: ", error);
    return { response: formatReturnError(`Unable to load bot: ${error.message || error}`) };
  }
}

export async function createBot(claim: PartialClaims, pars: { name: string, endpoint: string }) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }

  let displayName: string;
  try {
    displayName = validateBotDisplayName(pars?.name ?? '');
  } catch (error) {
    const mapped = mapBotNameError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }

  const endpoint = pars?.endpoint?.trim();
  if (!endpoint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "An HTTPS endpoint is required for the bot" }),
      headers
    };
  }

  const userPoolId = process.env.BOTPOOL_ID;
  if (!userPoolId) {
    return formatReturnError("BOTPOOL_ID environment variable is not set");
  }

  let clientId: string | undefined;
  let nameReserved = false;

  try {
    const response = await cognitoClient.send(new CreateUserPoolClientCommand(
      buildCreateBotClientInput(userPoolId, `bot-${uuid()}`)
    ));
    clientId = response.UserPoolClient?.ClientId;
    const clientSecret = response.UserPoolClient?.ClientSecret;

    if (!clientId || !clientSecret) {
      throw new Error("Cognito did not return ClientId or ClientSecret");
    }

    displayName = await reserveBotDisplayName(displayName, clientId, claim.sub);
    nameReserved = true;

    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        pk: "BOT",
        sk: clientId,
        name: displayName,
        endpoint,
        lastseen: Date.now(),
        owner: claim.sub
      }
    }));

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeNames: { "#b": "bots" },
      ExpressionAttributeValues: { ":b": new Set([clientId]) },
      UpdateExpression: "ADD #b :b",
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ clientId, clientSecret }),
      headers
    };
  } catch (error: any) {
    console.error("Error creating bot: ", error);

    if (nameReserved) {
      try {
        await releaseBotDisplayName(displayName);
      } catch (releaseError) {
        console.error("Error releasing bot name reservation after failed create: ", releaseError);
      }
    }

    if (clientId) {
      try {
        await cognitoClient.send(new DeleteUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
        }));
      } catch (deleteError) {
        console.error("Error deleting Cognito client after failed create: ", deleteError);
      }
    }

    const mapped = mapBotNameError(error);
    if (mapped) {
      return mapped;
    }

    return formatReturnError(`Unable to create bot: ${error.message || error}`);
  }
}

export async function updateBot(
  claim: PartialClaims,
  pars: {
    clientId: string;
    name: string;
    endpoint: string;
    description?: string;
    supported?: { meta: string; variants: string[] }[];
  }
) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }

  const clientId = pars?.clientId;
  if (!clientId || clientId.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "A clientId is required to identify the bot" }),
      headers
    };
  }

  try {
    const data = await ddbDocClient.send(new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));

    if (!data.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
        headers
      };
    }

    const bot = data.Item;
    if (bot.owner !== claim.sub) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "You are not the owner of this bot" }),
        headers
      };
    }

    // Update the values (but never update clientId/sk)
    if (pars.name !== undefined) {
      bot.name = await renameBotDisplayName(
        bot.name as string,
        pars.name,
        clientId,
        claim.sub
      );
    }
    if (pars.endpoint !== undefined) {
      const trimmedEndpoint = pars.endpoint.trim();
      if (!trimmedEndpoint) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "An HTTPS endpoint is required for the bot" }),
          headers
        };
      }
      bot.endpoint = trimmedEndpoint;
    }
    if (pars.description !== undefined) {
      const validated = validateAboutText(pars.description);
      if (!validated.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: validated.message }),
          headers,
        };
      }
      const previousDescription = typeof bot.description === 'string' ? bot.description : undefined;
      const saveState = await loadAboutSaveState(claim.sub);
      const saveCheck = checkAboutSaveAllowed(
        previousDescription,
        validated.text,
        saveState,
      );
      if (!saveCheck.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: saveCheck.message }),
          headers,
        };
      }
      bot.description = validated.text;
      if (!saveCheck.skip) {
        await ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { pk: 'USER', sk: claim.sub },
          ExpressionAttributeValues: {
            ':day': saveCheck.aboutSaveDay,
            ':count': saveCheck.aboutSaveCount,
          },
          ExpressionAttributeNames: {
            '#day': 'aboutSaveDay',
            '#count': 'aboutSaveCount',
          },
          UpdateExpression: 'set #day = :day, #count = :count',
        }));
      }
    }
    if (pars.supported !== undefined) {
      if (!Array.isArray(pars.supported)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "supported must be an array of objects matching {meta: string, variants: string[]}" }),
          headers
        };
      }
      for (const entry of pars.supported) {
        const variantErr = validateChallengeVariantUids(entry.meta, entry.variants);
        if (variantErr) {
          return variantErr;
        }
      }
      bot.supported = pars.supported;
    }

    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: bot
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Bot updated successfully" }),
      headers
    };
  } catch (error: any) {
    console.error("Error updating bot: ", error);
    const mapped = mapBotNameError(error);
    if (mapped) {
      return mapped;
    }
    return formatReturnError(`Unable to update bot: ${error.message || error}`);
  }
}

export async function beginBotSecretRotation(claim: PartialClaims, pars: { clientId: string }) {
  const loaded = await loadOwnedBot(claim, pars?.clientId);
  if ("response" in loaded) {
    return loaded.response;
  }

  const clientId = loaded.bot.sk;

  try {
    const { clientSecretId, clientSecret } = await cognitoBeginBotSecretRotation(clientId);
    const pendingSecretCreatedAt = Date.now();

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId },
      UpdateExpression: "SET pendingSecretId = :pendingSecretId, pendingSecretCreatedAt = :pendingSecretCreatedAt",
      ExpressionAttributeValues: {
        ":pendingSecretId": clientSecretId,
        ":pendingSecretCreatedAt": pendingSecretCreatedAt,
      },
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        clientSecretId,
        clientSecret,
        secretRotationPending: true,
        pendingSecretId: clientSecretId,
        pendingSecretCreatedAt,
      }),
      headers
    };
  } catch (error: any) {
    console.error("Error beginning bot secret rotation: ", error);
    if (error.message === "No client secrets found") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message }),
        headers
      };
    }
    return mapCognitoBotSecretError(error, "begin bot secret rotation");
  }
}

export async function finalizeBotSecretRotation(claim: PartialClaims, pars: { clientId: string }) {
  const loaded = await loadOwnedBot(claim, pars?.clientId);
  if ("response" in loaded) {
    return loaded.response;
  }

  const clientId = loaded.bot.sk;

  try {
    await cognitoFinalizeBotSecretRotation(clientId);

    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId },
      UpdateExpression: "REMOVE pendingSecretId, pendingSecretCreatedAt",
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Bot secret rotation finalized successfully",
        secretRotationPending: false,
      }),
      headers
    };
  } catch (error: any) {
    console.error("Error finalizing bot secret rotation: ", error);
    if (error.message === "No secret rotation in progress") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message }),
        headers
      };
    }
    return mapCognitoBotSecretError(error, "finalize bot secret rotation");
  }
}

export async function deleteBot(claim: PartialClaims, pars: { clientId: string }) {
  if (!claim || !claim.sub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" }),
      headers
    };
  }

  const clientId = pars?.clientId;
  if (!clientId || clientId.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "A clientId is required to identify the bot to delete" }),
      headers
    };
  }

  try {
    // 1. Fetch BOT record to verify owner
    const data = await ddbDocClient.send(new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));

    if (!data.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Bot with client ID ${clientId} not found` }),
        headers
      };
    }

    const bot = data.Item;
    if (bot.owner !== claim.sub) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: "You are not the owner of this bot" }),
        headers
      };
    }

    // 2. Delete User Pool Client from botpool
    const userPoolId = process.env.BOTPOOL_ID;
    if (!userPoolId) {
      throw new Error("BOTPOOL_ID environment variable is not set");
    }

    const command = new DeleteUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId
    });
    await cognitoClient.send(command);

    try {
      await releaseBotDisplayName(bot.name as string);
    } catch (releaseError) {
      console.error(`Error releasing bot name for ${clientId}:`, releaseError);
    }

    // 3. Delete BOT record from DynamoDB
    await ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: "BOT",
        sk: clientId
      }
    }));

    // Update owner's USER record
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeNames: { "#b": "bots" },
      UpdateExpression: "DELETE #b :b",
      ExpressionAttributeValues: { ":b": new Set([clientId]) }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Bot deleted successfully" }),
      headers
    };
  } catch (error: any) {
    console.error("Error deleting bot: ", error);
    const mapped = mapBotNameError(error);
    if (mapped) {
      return mapped;
    }
    return formatReturnError(`Unable to delete bot: ${error.message || error}`);
  }
}
