export type JwtLogSummary = {
  sub?: string;
  client_id?: string;
  scope?: string;
  iss?: string;
  token_use?: string;
  exp?: number;
  aud?: string | string[];
  decodeError?: string;
};

export function summarizeJwtForLog(token: string): JwtLogSummary {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return { decodeError: 'token is not a JWT' };
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtLogSummary;
    return {
      sub: payload.sub,
      client_id: payload.client_id,
      scope: payload.scope,
      iss: payload.iss,
      token_use: payload.token_use,
      exp: payload.exp,
      aud: payload.aud,
    };
  } catch (error: unknown) {
    return { decodeError: error instanceof Error ? error.message : String(error) };
  }
}

export function summarizeUrlForLog(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return { host: 'invalid-url', path: url };
  }
}

export function isApiGatewayUnauthorized(statusCode: number, body: string): boolean {
  return statusCode === 401 && body.includes('"Unauthorized"');
}
