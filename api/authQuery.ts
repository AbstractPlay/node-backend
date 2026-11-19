import type { PartialClaims } from '../lib/api/types.js';
import { logAuthQueryAccess } from '../lib/api/rpcAccessLog.js';
import { runAuthQuery } from './routes/auth/index.js';

export const authQuery = async (event: {
  body: { query: any; pars: any };
  cognitoPoolClaims: PartialClaims;
  requestContext?: {
    requestId?: string;
    authorizer?: { claims?: { sub?: string } };
  };
}) => {
  const sub =
    event.cognitoPoolClaims.sub
    ?? event.requestContext?.authorizer?.claims?.sub;
  logAuthQueryAccess({
    query: event.body.query,
    sub,
    requestId: event.requestContext?.requestId,
  });
  return runAuthQuery(event.body.query, event.cognitoPoolClaims, event.body.pars);
};