import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  highlightGame,
  listHighlights,
  listUserRecommendations,
  listWatchedGames,
  recommendGame,
  type MarkResult,
  unhighlightGame,
  unrecommendGame,
  unwatchGame,
  watchGame,
} from '../playerGameMarks.js';

export type GameMarkPars = { metaGame: string; id: string };

function markResultResponse(result: MarkResult, successBody?: unknown) {
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(successBody ?? { message: 'Success' }),
    headers,
  };
}

function parseGameMarkPars(pars: GameMarkPars): GameMarkPars | undefined {
  if (!pars?.metaGame || !pars?.id) {
    return undefined;
  }
  return { metaGame: pars.metaGame, id: pars.id };
}

export async function watchGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await watchGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.metaGame,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const watchedGames = await listWatchedGames(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, watchedGames);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to watch game ${parsed.id}`);
  }
}

export async function unwatchGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await unwatchGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const watchedGames = await listWatchedGames(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, watchedGames);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to unwatch game ${parsed.id}`);
  }
}

export async function highlightGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await highlightGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.metaGame,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const highlights = await listHighlights(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, highlights);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to highlight game ${parsed.id}`);
  }
}

export async function unhighlightGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await unhighlightGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.metaGame,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const highlights = await listHighlights(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, highlights);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to unhighlight game ${parsed.id}`);
  }
}

export async function recommendGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await recommendGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.metaGame,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const representatives = await listUserRecommendations(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, representatives);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to recommend game ${parsed.id}`);
  }
}

export async function unrecommendGameAuth(userId: string, pars: GameMarkPars) {
  const parsed = parseGameMarkPars(pars);
  if (parsed === undefined) {
    return formatReturnError('metaGame and id are required.');
  }
  try {
    const result = await unrecommendGame(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      parsed.metaGame,
      parsed.id,
    );
    if (!result.ok) {
      return markResultResponse(result);
    }
    const representatives = await listUserRecommendations(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, userId);
    return markResultResponse(result, representatives);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to unrecommend game ${parsed.id}`);
  }
}
