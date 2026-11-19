import { headers } from './http.js';
import type { ApiHandlerResult } from './routeTypes.js';

export function rateLimitExceededResponse(): ApiHandlerResult {
  return {
    statusCode: 429,
    body: JSON.stringify({ message: 'Rate limit exceeded.' }),
    headers,
  };
}