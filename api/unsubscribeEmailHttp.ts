import { buildEmailUnsubscribeUrl } from '../lib/emailUnsubscribeToken.js';
import { applyEmailUnsubscribeToken } from '../lib/auth/applyEmailUnsubscribe.js';

const PLAIN_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

function tokenFromEvent(event: {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}): string {
  const fromQuery = event.queryStringParameters?.t?.trim() ?? '';
  if (fromQuery) {
    return fromQuery;
  }
  if (event.body && event.httpMethod === 'POST') {
    try {
      const params = new URLSearchParams(event.body);
      const fromBody = params.get('t')?.trim() ?? '';
      if (fromBody) {
        return fromBody;
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

export async function handler(event: {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}) {
  let body = event.body ?? '';
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  const token = tokenFromEvent({ ...event, body });

  if (event.httpMethod === 'GET') {
    if (!token) {
      return { statusCode: 400, headers: PLAIN_HEADERS, body: 'Missing token' };
    }
    const playUrl = buildEmailUnsubscribeUrl(token);
    if (!playUrl) {
      return { statusCode: 503, headers: PLAIN_HEADERS, body: 'Unavailable' };
    }
    return {
      statusCode: 302,
      headers: { Location: playUrl },
      body: '',
    };
  }

  if (event.httpMethod === 'POST') {
    if (!token) {
      return { statusCode: 400, headers: PLAIN_HEADERS, body: 'Missing token' };
    }
    const ok = await applyEmailUnsubscribeToken(token);
    return {
      statusCode: ok ? 200 : 400,
      headers: PLAIN_HEADERS,
      body: ok ? 'Unsubscribed' : 'Invalid or expired link',
    };
  }

  return { statusCode: 405, headers: PLAIN_HEADERS, body: 'Method not allowed' };
}