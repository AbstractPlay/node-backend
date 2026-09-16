import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { logRecommendationEvent, type RecommendationEventPars } from '../recommendationEvents.js';
import { logLayoutEvent, type LayoutEventPars } from '../layoutEvents.js';

export async function logRecommendationEventAuth(userId: string, pars: RecommendationEventPars) {
  try {
    const result = await logRecommendationEvent(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
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
    return formatReturnError(`Unable to log recommendation event for ${userId}`);
  }
}

export async function logLayoutEventAuth(userId: string, pars: LayoutEventPars) {
  try {
    const result = await logLayoutEvent(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
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
    return formatReturnError(`Unable to log layout event for ${userId}`);
  }
}
