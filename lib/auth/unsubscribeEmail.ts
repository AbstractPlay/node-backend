import { headers } from '../api/http.js';
import { applyEmailUnsubscribeToken } from './applyEmailUnsubscribe.js';

export type UnsubscribeEmailPars = {
  t?: string;
};

type UnsubscribeEmailBody = {
  ok: boolean;
};

const FAIL_BODY: UnsubscribeEmailBody = { ok: false };
const OK_BODY: UnsubscribeEmailBody = { ok: true };

function response(body: UnsubscribeEmailBody, statusCode = 200) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers,
  };
}

export async function unsubscribeEmailOpen(pars: UnsubscribeEmailPars) {
  const token = typeof pars.t === 'string' ? pars.t.trim() : '';
  if (!token) {
    return response(FAIL_BODY);
  }

  const ok = await applyEmailUnsubscribeToken(token);
  return response(ok ? OK_BODY : FAIL_BODY);
}