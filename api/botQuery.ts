import { headers, parseLambdaIntegrationBody } from '../lib/api/http.js';
import type { PartialClaims } from '../lib/api/types.js';
import { runBotVerb } from './routes/bot.js';

export const botQuery = async (event: {
  body: string | Record<string, unknown>;
  cognitoPoolClaims: PartialClaims;
}) => {
  console.log('botQuery: ', event.body);
  console.log('botQuery claims:', {
    sub: event.cognitoPoolClaims?.sub,
    email: event.cognitoPoolClaims?.email,
    email_verified: event.cognitoPoolClaims?.email_verified,
  });

  let body: Record<string, unknown>;
  try {
    body = parseLambdaIntegrationBody(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Invalid JSON in request body',
      }),
      headers,
    };
  }

  const verb = body.verb;
  return runBotVerb(typeof verb === 'string' ? verb : undefined, event.cognitoPoolClaims, body);
};
