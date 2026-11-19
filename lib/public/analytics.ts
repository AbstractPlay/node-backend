import { ddbDocClient } from '../ddb.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { logLayoutEvent, type LayoutEventPars } from '../layoutEvents.js';

export async function logLayoutEventOpen(pars: LayoutEventPars) {
  try {
    const result = await logLayoutEvent(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      undefined,
      pars,
    );
    if (!result.ok) {
      return formatReturnError(result.message);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to log layout event');
  }
}

/** Public `report_problem` — intentionally inert (abuse/cost). Front-end may still call; analytics TBD. */
export async function reportProblem(_pars: { error: string }) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Reported',
    }),
    headers,
  };
}
