import { CognitoJwtVerifier } from 'aws-jwt-verify';
import {
  enforceWsConnectRateLimit,
  type WsConnectRateLimitDeps,
} from '../../lib/rateLimit/wsConnectLimits.js';

export type WebSocketAuthorizerEvent = {
  type?: string;
  methodArn: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  identitySource?: string[];
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  requestContext?: {
    identity?: {
      sourceIp?: string;
    };
  };
};

export type WsAuthorizerDeps = {
  verifyToken: (token: string) => Promise<{ sub: string }>;
  enforceRateLimit: (
    sourceIp: string,
    deps?: Partial<WsConnectRateLimitDeps>,
  ) => Promise<{ allowed: true } | { allowed: false; window: string }>;
  rateLimitDeps?: Partial<WsConnectRateLimitDeps>;
};

type AuthorizerResponse = {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: Array<{
      Action: string;
      Effect: string;
      Resource: string;
    }>;
  };
  context?: Record<string, string>;
};

function denyPolicy(methodArn: string): AuthorizerResponse {
  return {
    principalId: 'anonymous',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: methodArn,
        },
      ],
    },
  };
}

function allowPolicy(methodArn: string, sub: string): AuthorizerResponse {
  return {
    principalId: sub,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: methodArn,
        },
      ],
    },
    context: {
      userId: sub,
    },
  };
}

export function extractConnectToken(event: WebSocketAuthorizerEvent): string | undefined {
  const fromQuery = event.queryStringParameters?.token;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }
  const fromIdentity = event.identitySource?.[0];
  if (typeof fromIdentity === 'string' && fromIdentity.trim()) {
    return fromIdentity.trim();
  }
  return undefined;
}

export function extractSourceIp(event: WebSocketAuthorizerEvent): string | undefined {
  const ip = event.requestContext?.identity?.sourceIp;
  if (typeof ip === 'string' && ip.trim()) {
    return ip.trim();
  }
  return undefined;
}

let defaultVerifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getDefaultVerifier() {
  if (!defaultVerifier) {
    defaultVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.userpoolId!,
      tokenUse: 'id',
      clientId: process.env.userpoolClient!,
    });
  }
  return defaultVerifier;
}

function defaultVerifyToken(): WsAuthorizerDeps['verifyToken'] {
  return async (token) => {
    const payload = await getDefaultVerifier().verify(token);
    if (!payload.sub) {
      throw new Error('missing sub');
    }
    return { sub: payload.sub };
  };
}

function resolveDeps(depsIn?: Partial<WsAuthorizerDeps>): WsAuthorizerDeps {
  return {
    verifyToken: depsIn?.verifyToken ?? defaultVerifyToken(),
    enforceRateLimit: depsIn?.enforceRateLimit ?? enforceWsConnectRateLimit,
    rateLimitDeps: depsIn?.rateLimitDeps,
  };
}

export async function handleWsAuthorizer(
  event: WebSocketAuthorizerEvent,
  depsIn?: Partial<WsAuthorizerDeps>,
): Promise<AuthorizerResponse> {
  const deps = resolveDeps(depsIn);
  const methodArn = event.methodArn;

  const token = extractConnectToken(event);
  if (!token) {
    return denyPolicy(methodArn);
  }

  let sub: string;
  try {
    ({ sub } = await deps.verifyToken(token));
  } catch {
    return denyPolicy(methodArn);
  }

  const sourceIp = extractSourceIp(event);
  if (sourceIp) {
    const rate = await deps.enforceRateLimit(sourceIp, deps.rateLimitDeps);
    if (!rate.allowed) {
      console.warn(JSON.stringify({
        evt: 'ws_connect_rate_limited',
        window: rate.window,
        sourceIp,
      }));
      return denyPolicy(methodArn);
    }
  }

  return allowPolicy(methodArn, sub);
}

export const wsAuthorizer = async (event: WebSocketAuthorizerEvent) => {
  return handleWsAuthorizer(event);
};