import type { PartialClaims } from '../lib/api/types.js';
import { runAuthQuery } from './routes/auth.js';

export const authQuery = async (event: {
  body: { query: any; pars: any };
  cognitoPoolClaims: PartialClaims;
}) => {
  console.log('authQuery: ', event.body.query);
  return runAuthQuery(event.body.query, event.cognitoPoolClaims, event.body.pars);
};
