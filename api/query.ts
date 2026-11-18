import { headers } from '../lib/api/http.js';
import { runPublicQuery } from './routes/public.js';

export const query = async (event: {
  queryStringParameters: any;
  body?: string;
  httpMethod: string;
  requestContext?: { identity?: { sourceIp?: string } };
}) => {
  console.log(event);

  let pars: any;
  let queryName: string | undefined;

  if (event.httpMethod === 'POST' && event.body) {
    try {
      const bodyData = JSON.parse(event.body);
      queryName = bodyData.query;
      pars = bodyData.pars || {};
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid JSON in request body',
        }),
        headers,
      };
    }
  } else {
    pars = event.queryStringParameters;
    queryName = pars?.query;
  }

  const sourceIp = event.requestContext?.identity?.sourceIp;
  if (sourceIp && pars && typeof pars === 'object' && !Array.isArray(pars)) {
    pars = { ...pars, _clientIp: sourceIp };
  }

  console.log(pars);
  return runPublicQuery(queryName, pars);
};
