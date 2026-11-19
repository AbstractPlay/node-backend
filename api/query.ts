import { headers } from '../lib/api/http.js';
import { logPublicQueryAccess, rpcParsKeyList } from '../lib/api/rpcAccessLog.js';
import { runPublicQuery } from './routes/public.js';

export const query = async (event: {
  queryStringParameters: any;
  body?: string;
  httpMethod: string;
  requestContext?: { requestId?: string; identity?: { sourceIp?: string } };
}) => {
  const requestId = event.requestContext?.requestId;
  const sourceIp = event.requestContext?.identity?.sourceIp;
  const isDev = process.env.WEBSOCKET_STAGE === 'dev';

  let pars: any;
  let queryName: string | undefined;

  if (event.httpMethod === 'POST' && event.body) {
    try {
      const bodyData = JSON.parse(event.body);
      queryName = bodyData.query;
      pars = bodyData.pars || {};
    } catch {
      logPublicQueryAccess({
        httpMethod: event.httpMethod,
        sourceIp,
        requestId,
        error: 'invalid_json',
      });
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

  if (sourceIp && pars && typeof pars === 'object' && !Array.isArray(pars)) {
    pars = { ...pars, _clientIp: sourceIp };
  }

  logPublicQueryAccess({
    httpMethod: event.httpMethod,
    query: queryName,
    sourceIp,
    requestId,
    parsKeys: rpcParsKeyList(pars),
  });

  if (isDev && pars !== undefined) {
    console.log(
      JSON.stringify({ evt: 'public_query_verbose', query: queryName, pars }),
    );
  }

  return runPublicQuery(queryName, pars);
};