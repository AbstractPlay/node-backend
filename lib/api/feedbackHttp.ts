import { headers } from './http.js';

export function feedbackErrorResponse(message: string, statusCode = 500, code?: string) {
  return {
    statusCode,
    body: JSON.stringify(code ? { message, code } : { message }),
    headers,
  };
}
