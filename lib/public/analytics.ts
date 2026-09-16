import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { validateToken } from '@sunknudsen/totp';
import { ddbDocClient } from '../ddb.js';
import { sesClient, s3Client } from '../api/clients.js';
import {
  headers,
  cachedListHeaders,
  feedbackListHeaders,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import type { User, UsersData } from '../api/types.js';

import { logLayoutEvent, type LayoutEventPars } from '../layoutEvents.js';
import { getPlayers } from '../players/getPlayers.js';

export async function logLayoutEventOpen(pars: LayoutEventPars) {
  try {
    const result = await logLayoutEvent(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      undefined,
      pars,
    );
    if (!result.ok) {
      return formatReturnError(result.message);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to log layout event');
  }
}

export async function reportProblem(pars: { error: string }) {
  console.log("Reported problem:", pars.error);
  const data = await ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeValues: { ":pk": "USERS" },
      ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
      ProjectionExpression: "sk, #name, lastSeen, country, stars",
      ReturnConsumedCapacity: "INDEXES"
    }));
  const users = data.Items;
  const playerIDs = [];
  for (const user of users!)
    if (user.name === 'fritzd' || user.name === 'Fritz Deelman' || user.name === 'Perlkönig')
      playerIDs.push(user.sk);
  const errorAdmins = await getPlayers(playerIDs);
  const addresses = [];
  for (const admin of errorAdmins) {
    if (admin.email !== undefined && admin.email !== null && admin.email !== "")
      addresses.push(admin.email);
  }
  const email = new SendEmailCommand({
    Destination: {
      ToAddresses: addresses
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: pars.error
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `AbstractPlay front end error report${process.env.ABSTRACT_PLAY_TABLE?.includes('-dev') ? ' (dev server)' : ''}`
      },
    },
    Source: "abstractplay@mail.abstractplay.com"
  });
  try {
    await sesClient.send(email);
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to send e-mail to error admins. Error: ${error}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Reported"
    }),
    headers
  };
}
