import type { PartialClaims } from './types.js';

/** API Gateway proxy result (handlers may omit optional fields). */
export type ApiHandlerResult = {
  statusCode: number;
  body?: string;
  headers: Record<string, string | boolean | number>;
};

export type PublicRouteHandler = (pars: any) => Promise<ApiHandlerResult | undefined>;

export type AuthRouteHandler = (
  claims: PartialClaims,
  pars: any,
) => Promise<ApiHandlerResult | undefined>;

export type BotRouteHandler = (
  claims: PartialClaims,
  body: Record<string, unknown>,
) => Promise<ApiHandlerResult>;
