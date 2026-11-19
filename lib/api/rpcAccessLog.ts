/** Lightweight RPC access lines for CloudWatch (no full API Gateway events). */

export function rpcParsKeyList(pars: unknown): string[] {
  if (!pars || typeof pars !== 'object' || Array.isArray(pars)) {
    return [];
  }
  return Object.keys(pars as Record<string, unknown>)
    .filter((k) => k !== '_clientIp')
    .sort();
}

export function logPublicQueryAccess(record: {
  httpMethod: string;
  query?: string;
  sourceIp?: string;
  requestId?: string;
  parsKeys?: string[];
  error?: string;
}): void {
  console.log(JSON.stringify({ evt: 'public_query', ...record }));
}

export function logAuthQueryAccess(record: {
  query?: string;
  sub?: string;
  requestId?: string;
}): void {
  console.log(JSON.stringify({ evt: 'auth_query', ...record }));
}