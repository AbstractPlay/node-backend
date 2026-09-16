/* eslint-disable @typescript-eslint/ban-ts-comment */

import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand, QueryCommandInput, GetCommandOutput, PutCommandOutput, UpdateCommandOutput, DeleteCommandOutput, QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, SendMessageCommandOutput, SendMessageRequest } from "@aws-sdk/client-sqs";
import { CreateUserPoolClientCommand, DeleteUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, GameBase, GameBaseSimultaneous, validateVariantSelection } from '@abstractplay/gameslib';
import { localizedGameName } from '../lib/gameDisplayName.js';
import { effectiveFlags, flagSetIncludes, structuralFlags, applyPerspectivePlayerRotations } from '../lib/effectiveGameFlags.js';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import webpush from "web-push";
import { validateToken } from '@sunknudsen/totp';
import i18n from '../lib/i18nInstance.js';
import { ddbDocClient } from '../lib/ddb.js';
import { sesClient, s3Client, sqsClient, cognitoClient } from '../lib/api/clients.js';
import {
  headers,
  cachedListHeaders,
  feedbackListHeaders,
  formatReturnError,
  logGetItemError,
  handleCommonErrors,
} from '../lib/api/http.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../lib/api/i18n.js';
import { sendCommandWithRetry } from '../lib/api/ddbRetry.js';
import type { User, UserSettings, UserLastSeen, UsersData, PartialClaims } from '../lib/api/types.js';

export type { UserSettings, UserLastSeen, User, UsersData } from '../lib/api/types.js';
export { changeLanguageForPlayer, createSendEmailCommand, initi18n } from '../lib/api/i18n.js';
export { formatReturnError, logGetItemError, handleCommonErrors } from '../lib/api/http.js';

import { wsBroadcast } from '../lib/wsBroadcast.js';
import { checkInGameCommentAuth } from '../lib/commentAuth.js';
import {
  highlightGame,
  listHighlights,
  listMetaGameRecommendations,
  listUserRecommendations,
  listWatchedGames,
  countGameWatchers,
  recommendGame,
  type GameMarkSummary,
  type HighlightEntry,
  type MarkResult,
  type RepresentativeEntry,
  unhighlightGame,
  unrecommendGame,
  unwatchGame,
  updateLastChatForWatchers,
  updateWatcherSummaries,
  watchGame,
  setWatchedSeen,
} from '../lib/playerGameMarks.js';
import {
  isBotId,
  getParticipants,
  getBotRecord,
  filterHumanIds,
  botToFullUserStub,
  toClientBot,
  ClientBot,
  BotRecord,
} from '../lib/participants.js';
import { enqueueBotOutbound, getToMovePlayerIds, loadGameRecord } from '../lib/botOutbound.js';
import {
  beginBotSecretRotation as cognitoBeginBotSecretRotation,
  finalizeBotSecretRotation as cognitoFinalizeBotSecretRotation,
} from '../lib/botSecrets.js';
import { buildCreateBotClientInput } from '../lib/botCognito.js';
import {
  BotNameTakenError,
  BotNameValidationError,
  reserveBotDisplayName,
  releaseBotDisplayName,
  renameBotDisplayName,
  validateBotDisplayName,
} from '../lib/botNames.js';
import { hydrateGameState, prepareGameStateForStorage, setGameEndedFromEngine } from '../lib/gameState.js';
import { adjustShardedCounts, ensureShardedMetaGameCountEntry } from '../lib/gameProjector.js';
import { adminDeleteGame } from '../lib/adminDeleteGame.js';
import { filterExplorationTreeForSave, type ExplorationTreeNode } from '../lib/explorationMoves.js';
import {
  buildStartSoloGame,
  normalizeSoloClocks,
  soloPlaySupported,
} from '../lib/soloGame.js';
import { tournamentPlaySupported } from '../lib/tournamentGame.js';
import {
  loadDashboardGames,
  listActiveGameKeys,
  shouldWriteGameOpenOverlay,
} from '../lib/dashboardGames.js';
import { runDashboardMaintenance, checkAndProcessGameTimeout } from '../lib/dashboardMaintenance.js';
import {
  buildMeDashboardPayload,
  buildMeProfilePayload,
  type MeAncillaryData,
  type MeChallengeData,
} from '../lib/meQuery.js';
import { stripColorFromSettings } from '../lib/stripLegacyColorSettings.js';
import { normalizeAvatarInSettings } from '../lib/dicebearAvatar.js';
import { getUsersLastSeen } from '../lib/touchUserLastSeen.js';
import { hasCurrentGameRow } from '../lib/dashboardGames.js';
import {
  upsertUserGameOverlay,
} from '../lib/userGameOverlay.js';
import {
  type PushOptions,
  deleteAllPushSubscriptions,
  deletePushSubscriptionByEndpoint,
  queryPushSubscriptions,
  savePushSubscription,
  sendPushToSubscriptions,
} from '../lib/pushSubscriptions.js';
import {
  deletePlaygroundSave,
  getPlaygroundSave,
  listPlaygroundSaves,
  putPlaygroundSave,
  validatePlaygroundSaveInput,
  type PlaygroundSaveInput,
} from '../lib/playgroundSaves.js';
import { loadSummaryPlayerCountsByUid } from '../lib/summaryRatings.js';
import { getPlayerRelationIds } from '../lib/playerRelations.js';
import {
  ensureMetaGameCountEntry,
  ensureMissingMetaGameCounts,
  assembleTags,
  DEFAULT_META_GAME_COUNTS,
} from '../lib/metaGameBootstrap.js';
import { getPlayers } from '../lib/players/getPlayers.js';
import { setSeenTime } from '../lib/games/setSeenTime.js';
import { feedbackErrorResponse } from '../lib/api/feedbackHttp.js';
import { game } from '../lib/games/getGame.js';
import { timeloss } from '../lib/games/timeloss.js';
import { validateChallengeVariantUids } from '../lib/challenges/variantUids.js';
import { realPingBot } from '../lib/bots/realPingBot.js';
import { notifyRegisteredBotsTurn } from '../lib/bots/notifyTurn.js';
import { setToJSONReplacer } from '../lib/profile/setToJson.js';
import { getChallenges } from '../lib/profile/me.js';
const Set_toJSON = setToJSONReplacer;
import { sendUserPush } from '../lib/push/sendUserPush.js';
import {
  logRecommendationEvent,
  type RecommendationEventPars,
} from '../lib/recommendationEvents.js';
import {
  logLayoutEvent,
  type LayoutEventPars,
} from '../lib/layoutEvents.js';
import {
  feedbackAdminList,
  feedbackComment,
  feedbackCreate,
  feedbackGet,
  feedbackList,
  feedbackMine,
  feedbackPresignUpload,
  feedbackSetAdminFields,
  feedbackSetStatus,
  feedbackReclassify,
  feedbackSubscribe,
  feedbackUpdate,
  feedbackVote,
  feedbackMerge,
  feedbackDelete,
  feedbackWishlistSearch,
  feedbackHistoryList,
  feedbackHoldRetention,
  attachWishlistCoverImageUrls,
  type FeedbackAdminListPars,
  type FeedbackCommentPars,
  type FeedbackCreatePars,
  type FeedbackGetPars,
  type FeedbackListPars,
  type FeedbackMinePars,
  type FeedbackPresignUploadPars,
  type FeedbackSetAdminFieldsPars,
  type FeedbackSetStatusPars,
  type FeedbackReclassifyPars,
  type FeedbackSubscribePars,
  type FeedbackUpdatePars,
  type FeedbackVotePars,
  type FeedbackDeletePars,
  type FeedbackMergePars,
  type FeedbackWishlistSearchPars,
  type FeedbackHistoryListPars,
  type FeedbackHoldRetentionPars,
} from '../lib/feedback/index.js';
import {
  announcementsList,
  announcementGet,
  announcementsAdminList,
  announcementSaveWithOptionalRss,
  announcementGetAdmin,
  announcementPresignUpload,
  announcementPublish,
  announcementRetract,
  fanOutAnnouncementPublished,
  announcementReact,
  announcementReactionsMine,
  announcementsMarkRead,
  type AnnouncementsListPars,
  type AnnouncementGetPars,
  type AnnouncementsAdminListPars,
  type AnnouncementSavePars,
  type AnnouncementPresignUploadPars,
} from '../lib/announcements/index.js';
import { announcementsSiteUrl } from '../lib/announcements/siteUrl.js';
import { syncAnnouncementNotifyIndex } from '../lib/announcements/announcementNotifyIndex.js';
import {
  feedbackNewKindsFromSettings,
  syncFeedbackNewNotifyIndex,
} from '../lib/feedback/feedbackNewNotifyIndex.js';
import {
  queryRecentCompletedGames,
  updateCompletedGameCommentedFlag,
  type RecentCompletedGamesPars,
} from '../lib/recentCompletedGames.js';
import { queryAllStandingChallenges } from '../lib/allStandingChallenges.js';
import { declinesDirectChallenges } from '../lib/challenges.js';
import { validateAboutText } from '../lib/aboutText.js';
import { validateUserDisplayName } from '../lib/userDisplayName.js';
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  isDisplayNameTaken,
} from '../lib/displayNameAvailability.js';
import { checkAboutSaveAllowed } from '../lib/aboutSaves.js';
import {
  createNotification,
  dismissNotification as deleteUserNotification,
  dismissAllNotifications,
  enqueueEventInvitationNotifications,
  enqueueCompletedGameChatNotifications,
  enqueueGameEndNotifications,
  enqueueGameStartNotifications,
  collectGameEndScoresFromEngine,
  formatNotificationScores,
  inAppSettingsMapFromUsers,
  loadNotificationsForDashboard,
  markNotificationsSeen,
  optionalNotificationNote,
  resolveEventInvitationNotifyIds,
  type InAppNotificationUserSettings,
  type NotificationGame,
  type NotificationScore,
} from '../lib/notifications.js';

// Types
type MetaGameCounts = {
  [metaGame: string]: {
    currentgames: number;
    completedgames: number;
    standingchallenges: number;
    ratings?: number;
    stars?: number;
    tags?: string[];
  }
}

type Challenge = {
  metaGame: string;
  standing?: boolean;
  challenger: User;
  players: User[];
  challengees?: User[];
}

type FullChallenge = {
  pk?: string,
  sk?: string,
  metaGame: string;
  numPlayers: number;
  standing?: boolean;
  duration?: number;
  seating: string;
  variants: string[];
  challenger: User;
  challengees?: User[]; // players who were challenged
  players?: User[]; // players that have accepted
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  comment?: string;
  dateIssued?: number;
}

type FullUser = {
  pk?: string,
  sk?: string,
  id: string;
  name: string;
  email: string;
  /** @deprecated Phase 5 — legacy field; lazy-removed from USER records. Dashboard uses indexes only. */
  games?: Game[];
  challenges_issued?: Set<string>;
  bots?: Set<string>;
  challenges_received?: Set<string>;
  challenges_accepted?: Set<string>;
  challenges_standing?: Set<string>;
  admin: boolean | undefined;
  organizer: boolean | undefined;
  language: string;
  country: string;
  lastSeen?: number;
  settings: UserSettings;
  /** @deprecated Legacy realtime Elo on USER records; no longer updated. Batch ratings live in summary CDN. */
  ratings?: {
    [metaGame: string]: {
      rating: number;
      N: number;
      wins: number;
      draws: number;
    };
  };
  stars?: string[];
  tags?: TagList[];
  mayPush?: boolean;
  publicRivalries?: boolean;
  bggid?: string;
  about?: string;
  /** Set by abandoned-account dashboard cleanup cron; cleared on me() login. */
  cleaned?: boolean;
}

type Bot = ClientBot;

type MeData = {
  id: string;
  name: string;
  admin: boolean;
  organizer: boolean;
  language: string;
  country: string;
  games: Game[];
  settings: UserSettings;
  stars: string[];
  bggid?: string;
  about?: string;
  tags?: TagList[];
  mayPush: boolean;
  publicRivalries: boolean;
  bots?: Bot[];
  challengesIssued?: FullChallenge[];
  challengesReceived?: FullChallenge[];
  challengesAccepted?: FullChallenge[];
  standingChallenges?: FullChallenge[];
  realStanding?: StandingChallenge[];
  customizations?: { [key: string]: any };
  blocked?: string[];
  watchedGames?: Game[];
  highlights?: Game[];
  representatives?: Game[];
}

type Note = {
  pk: string;
  sk: string;
  note: string;
}

type Game = {
  pk?: string,
  sk?: string,
  id: string;
  metaGame: string;
  players: User[];
  lastMoveTime: number;
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  note?: string;
  seen?: number;
  winner?: number[];
  numMoves?: number;
  gameStarted?: number;
  gameEnded?: number;
  lastChat?: number;
  variants?: string[];
  commented?: number; // 0 or missing: no comments or post game variations, 1: has in-game comments, 2: has post game variations, 3: has post game comments. Only used in COMPLETEDGAMES#<metaGame> rows.
}

type FullGame = {
  pk: string;
  sk: string;
  id: string;
  clockHard: boolean;
  clockInc: number;
  clockMax: number;
  clockStart: number;
  gameStarted: number;
  gameEnded?: number;
  lastMoveTime: number;
  metaGame: string;
  numPlayers: number;
  players: User[];
  state: string;
  note?: string;
  toMove: string | boolean[];
  partialMove?: string;
  winner?: number[];
  numMoves?: number;
  rated?: boolean;
  pieInvoked?: boolean;
  variants?: string[];
  published?: string[];
  smevent?: string;
  smeventRound?: number;
  tournament?: string;
  event?: string;
  division?: number;
  noExplore?: boolean;
  commented?: number; // 0 or missing: no comments or post game variations, 1: has in-game comments (note this does NOT get updated for post-game comments/variations)
}

function toNotificationGame(
  game: Pick<FullGame, 'id' | 'metaGame' | 'variants' | 'players' | 'winner'>,
  scores?: NotificationScore[],
): NotificationGame {
  return {
    id: game.id,
    metaGame: game.metaGame,
    variants: game.variants,
    players: game.players.map(p => ({ id: p.id, name: p.name })),
    winner: game.winner,
    ...(scores !== undefined && scores.length > 0 ? { scores } : {}),
  };
}

type Comment = {
  comment: string;
  userId: string;
  moveNumber: number;
  timeStamp: number;
}

type Exploration = {
  version?: number;
  id: string;
  move: number;
  comment: string;
  children: Exploration[];
  outcome?: number; // Optional. 0 for player1 win, 1 for player2 win, -1 for undecided.
  premove?: boolean; // Optional. If true, this move will be automatically submitted when the opponent plays the parent move.
};

type Division = {
  numGames: number;
  numCompleted: number;
  processed: boolean;
  winnerid?: string;
  winner?: string;
};

type Tournament = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  variants: string[];
  number: number;
  started: boolean;
  dateCreated: number;
  datePreviousEnded: number; // 0 means either the first tournament or a restart of the series (after it stopped because not enough participants), 3000000000000 means previous tournament still running.
  nextid?: string;
  dateStarted?: number;
  dateEnded?: number;
  divisions?: {
    [division: number]: Division;
  };
  players?: TournamentPlayer[]; // only on archived tournaments
  waiting?: boolean; // tournament does not yet have 4 players
};

type TournamentPlayer = {
  pk: string;
  sk: string;
  playerid: string;
  playername: string;
  once?: boolean;
  division?: number;
  score?: number;
  tiebreak?: number;
  rating?: number;
  timeout?: boolean;
};

type TournamentGame = {
  pk: string;
  sk: string;
  id: string;
  player1: string;
  player2: string;
  winner?: string[];
};

type OrgEvent = {
  pk: "ORGEVENT";
  sk: string;             // <eventid>
  name: string;
  description: string;
  organizer: string;
  dateStart: number;
  dateEnd?: number;
  winner?: string[];
  visible: boolean;
  maxPlayers: number;
  invited?: string[];
  blocked?: string[];
}

type OrgEventGame = {
  pk: "ORGEVENTGAME";
  sk: string;             // <eventid>#<gameid>
  metaGame: string;
  variants?: string[];
  round: number;
  gameid: string;
  player1: string;
  player2: string;
  winner?: string[];
  arbitrated?: boolean;
};

type OrgEventPlayer = {
  pk: "ORGEVENTPLAYER";
  sk: string;             // <eventid>#<playerid>
  playerid: string;
  division?: number;
  seed?: number;
};

type TagList = {
  meta: string;
  tags: string[];
}

type TagRec = {
  pk: "TAG";
  sk: string;
  tags: TagList[];
}

type Customization = {
  colourContext: {
    [k: string]: string;
  },
  palette: string[];
  glyphmap?: unknown[];
  preferredColour?: string;
}

type CustomizationRec = {
  pk: string;
  sk: string;
  settings: Customization;
}

// SDG-style standing challenges
type StandingChallenge = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean
  limit: number;
  sensitivity: "meta" | "variants";
  suspended: boolean;
};

type StandingChallengeRec = {
  pk: "REALSTANDING";
  sk: string; // user's ID
  standing: StandingChallenge[];
};



















async function sendPush(opts: PushOptions) {
  return sendUserPush(opts);
}

async function toggleStar(userid: string, pars: { metaGame: string }) {
  try {
    // get player
    const player = (await getPlayers([userid]))[0];
    // add or remove metaGame
    let delta = 0;
    if (player.stars === undefined) {
      player.stars = [];
    }
    if (!player.stars.includes(pars.metaGame)) {
      delta = 1;
      player.stars.push(pars.metaGame);
    } else {
      delta = -1;
      const idx = player.stars.findIndex((m: string) => m === pars.metaGame);
      player.stars.splice(idx, 1);
    }
    // queue player update
    const list: Promise<any>[] = [];
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss",
      }))
    );
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss",
      }))
    );
    console.log(`Queued update to player ${player.id}, ${player.name}, toggling star for ${pars.metaGame}: ${delta}`);

    await ensureMetaGameCountEntry(pars.metaGame);

    list.push(adjustShardedCounts(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      pars.metaGame,
      { stars: delta },
    ));

    // run all updates
    console.log("Running queued updates");
    await Promise.all(list);
    console.log("Done");
    return {
      statusCode: 200,
      body: JSON.stringify(player.stars),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to toggle star for ${userid}, ${pars.metaGame} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

// NOTE: This function will blow up hidden-information games
async function injectState(userid: string, pars: { id: string; newState: string; metaGame: string; }) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to inject state ${userid}`);
  }

  // get the game. For now we will assume this isn't a finished game.
  let game: FullGame;
  try {
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
      }));
    const gameData = await getGame;
    console.log("Got:");
    console.log(gameData);
    game = hydrateGameState(gameData.Item as FullGame);
    if (game === undefined) {
      throw new Error(`Game ${pars.id} not found`);
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  // update the state
  game.state = pars.newState;

  // store the updated game
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game)
    }));
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(game),
    headers
  };
}

async function updateGameSettings(userid: string, pars: { game: string, settings: any, metaGame: string, cbit: number }) {
  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError("cbit must be 0 or 1");
  }
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#" + pars.cbit + '#' + pars.game
        },
      }));
    console.log("Got:");
    console.log(data);
    const game = hydrateGameState(data.Item as FullGame);
    if (game === undefined)
      throw new Error(`updateGameSettings: game ${pars.game} not found`);
    const player = game.players.find((p: { id: any; }) => p.id === userid);
    if (player === undefined)
      throw new Error(`updateGameSettings: player ${userid} isn't playing in game ${pars.game}`);
    player.settings = stripColorFromSettings(pars.settings);
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage(game)
      }));
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    return {
      statusCode: 200,
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get or update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}






async function updateUserSettings(userid: string, pars: { settings: any; }) {
  try {
    const settings = stripColorFromSettings(pars.settings) as Record<string, unknown>;
    const avatarResult = normalizeAvatarInSettings(settings);
    if (!avatarResult.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: avatarResult.error }),
        headers,
      };
    }

    const updateParts = ['settings = :ss'];
    const expressionValues: Record<string, unknown> = { ':ss': settings };
    const removeParts: string[] = [];

    if (avatarResult.hasAvatar) {
      const avatar = (settings.all as Record<string, unknown>).profile as Record<string, unknown>;
      const stored = avatar.avatar as { style: string; seed: string };
      updateParts.push('avatarStyle = :avatarStyle', 'avatarSeed = :avatarSeed');
      expressionValues[':avatarStyle'] = stored.style;
      expressionValues[':avatarSeed'] = stored.seed;
    } else {
      removeParts.push('avatarStyle', 'avatarSeed');
    }

    const updateExpression = `set ${updateParts.join(', ')}${
      removeParts.length > 0 ? ` remove ${removeParts.join(', ')}` : ''
    }`;

    const userUpdate = new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      ExpressionAttributeValues: expressionValues,
      UpdateExpression: updateExpression,
    });

    const usersAvatarUpdate = avatarResult.hasAvatar
      ? new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": userid },
        ExpressionAttributeValues: {
          ':avatarStyle': expressionValues[':avatarStyle'],
          ':avatarSeed': expressionValues[':avatarSeed'],
        },
        UpdateExpression: 'set avatarStyle = :avatarStyle, avatarSeed = :avatarSeed',
      })
      : new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": userid },
        UpdateExpression: 'remove avatarStyle, avatarSeed',
      });

    await Promise.all([
      ddbDocClient.send(userUpdate),
      ddbDocClient.send(usersAvatarUpdate),
    ]);

    const feedbackTable = process.env.FEEDBACK_TABLE;
    if (feedbackTable) {
      try {
        const kinds = feedbackNewKindsFromSettings(settings);
        await syncFeedbackNewNotifyIndex(ddbDocClient, feedbackTable, userid, kinds);
      } catch (syncErr) {
        console.error('syncFeedbackNewNotifyIndex failed', syncErr);
      }
    }

    const mainTable = process.env.ABSTRACT_PLAY_TABLE;
    if (mainTable) {
      try {
        await syncAnnouncementNotifyIndex(ddbDocClient, mainTable, userid, settings);
      } catch (syncErr) {
        console.error('syncAnnouncementNotifyIndex failed', syncErr);
      }
    }

    console.log("Success - user settings updated");
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user settings for user ${userid}`,
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to store user settings for user ${userid}`);
  }
}







export async function botRespondToChallenge(
  botId: string,
  challengeId: string,
  metaGame: string,
  standing: boolean,
  accepted: boolean
) {
  return respondedChallenge(botId, {
    response: accepted,
    id: challengeId,
    standing,
    metaGame,
    comment: accepted ? "Let's play!" : "",
  });
}


async function startSoloGame(userid: string, pars: {
  metaGame?: string;
  variants?: string[];
  challengeSeed?: string;
  clockStart?: number;
  clockInc?: number;
  clockMax?: number;
  clockHard?: boolean;
  noExplore?: boolean;
}) {
  const metaGame = pars.metaGame;
  if (metaGame === undefined || metaGame.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "metaGame is required" }),
      headers,
    };
  }
  if (!soloPlaySupported(metaGame)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Game ${metaGame} does not support solo play` }),
      headers,
    };
  }
  const variantErr = validateChallengeVariantUids(metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }

  let built;
  try {
    built = buildStartSoloGame({
      metaGame,
      variants: pars.variants,
      challengeSeed: pars.challengeSeed,
      noExplore: pars.noExplore,
      ...normalizeSoloClocks(pars),
    });
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `${error}` }),
      headers,
    };
  }

  const info = gameinfo.get(metaGame)!;
  const playersFull = await getParticipants([userid]);
  const player = playersFull[0];
  if (player === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not load player profile" }),
      headers,
    };
  }

  const clocks = normalizeSoloClocks(pars);
  const now = Date.now();
  let whoseTurn: string | boolean[] = "0";
  if (info.flags !== undefined && info.flags.includes('simultaneous')) {
    whoseTurn = [true];
  }

  const gamePlayers = [{
    id: player.id,
    name: player.name,
    time: clocks.clockStart * 3600000,
  }] as User[];

  await ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage({
      pk: "GAME",
      sk: `${metaGame}#0#${built.gameId}`,
      id: built.gameId,
      metaGame,
      numPlayers: 1,
      rated: false,
      players: gamePlayers,
      clockStart: clocks.clockStart,
      clockInc: clocks.clockInc,
      clockMax: clocks.clockMax,
      clockHard: clocks.clockHard,
      noExplore: pars.noExplore || false,
      state: built.state,
      toMove: whoseTurn,
      lastMoveTime: now,
      gameStarted: now,
      variants: built.variants,
    }),
  }));

  await enqueueGameStartNotifications(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    {
      id: built.gameId,
      metaGame,
      variants: built.variants,
      players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
    },
    inAppSettingsMapFromUsers([{ id: player.id, settings: player.settings }]),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      gameId: built.gameId,
      metaGame: info.name,
      metaGameUid: metaGame,
      challengeSeed: built.challengeSeed,
      simultaneous: info.flags !== undefined && info.flags.includes('simultaneous'),
    }),
    headers,
  };
}

async function newChallenge(userid: string, challenge: FullChallenge) {
  console.log("newChallenge challenge:", challenge);
  const variantErr = validateChallengeVariantUids(challenge.metaGame, challenge.variants);
  if (variantErr) {
    return variantErr;
  }
  if (challenge.standing) {
    return await newStandingChallenge(userid, challenge);
  }
  const challengeId = uuid();
  const botChallengees: { id: string }[] = [];
  const humanChallengees: { id: string; name?: string }[] = [];
  if (challenge.challengees !== undefined) {
    for (const challengee of challenge.challengees) {
      if (await isBotId(challengee.id)) {
        botChallengees.push(challengee);
      } else {
        humanChallengees.push(challengee);
      }
    }
  }

  let directChallengeOptOutUser: FullUser | undefined;
  let challengeePlayers: FullUser[] = [];
  if (humanChallengees.length > 0) {
    challengeePlayers = await getPlayers(humanChallengees.map(c => c.id));
    directChallengeOptOutUser = challengeePlayers.find(p => declinesDirectChallenges(p.settings));
  }
  const skipChallengeeNotify = directChallengeOptOutUser !== undefined;

  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "CHALLENGE",
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "duration": challenge.duration,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "challengees": challenge.challengees, // users that were challenged
      "players": [challenge.challenger], // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "rated": challenge.rated,
      "noExplore": challenge.noExplore || false,
      "comment": challenge.comment || "",
      "dateIssued": Date.now(),
    }
  }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challengeId]) },
    ExpressionAttributeNames: { "#ci": "challenges_issued" },
    UpdateExpression: "add #ci :c",
  }));

  const list: Promise<any>[] = [addChallenge, updateChallenger];
  for (const challengee of humanChallengees) {
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": challengee.id },
        ExpressionAttributeValues: { ":c": new Set([challengeId]) },
        ExpressionAttributeNames: { "#cr": "challenges_received" },
        UpdateExpression: "add #cr :c",
      }))
    );
  }
  if (humanChallengees.length > 0 && !skipChallengeeNotify) {
    try {
      list.push(sendChallengedEmail(challenge.challenger.name, humanChallengees as User[], challenge.metaGame, challenge.comment));
      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      const challengeNote = optionalNotificationNote(challenge.comment);
      const challengeeSettings = inAppSettingsMapFromUsers(challengeePlayers);
      for (const challengee of humanChallengees) {
        list.push(createNotification(ddbDocClient, tableName, challengee.id, {
          type: 'challengeIssued',
          challengeId,
          metaGame: challenge.metaGame,
          challengerId: challenge.challenger.id,
          challengerName: challenge.challenger.name,
          ...(challengeNote ? { note: challengeNote } : {}),
        }, {
          userSettings: challengeeSettings.get(challengee.id),
        }));
      }
    } catch (error) {
      logGetItemError(error);
      throw new Error("newChallenge: Failed to send emails");
    }
  }
  try {
    await Promise.all(list);
    console.log("Successfully added challenge" + challengeId);

    if (skipChallengeeNotify && directChallengeOptOutUser !== undefined) {
      await initi18n('en');
      return await respondedChallenge(directChallengeOptOutUser.id, {
        response: false,
        id: challengeId,
        standing: false,
        metaGame: challenge.metaGame,
        comment: i18n.t('DirectChallengeOptOutNote'),
      });
    }

    for (const challengee of botChallengees) {
      await enqueueBotOutbound({
        type: 'challenge',
        challengeId,
        metaGame: challenge.metaGame,
        botId: challengee.id,
        standing: false,
      });
    }

    // If the bot is challenged, trigger its challenge mgmt code here
    if (challenge.challengees !== undefined) {
      const idx = challenge.challengees.findIndex(u => u.id === process.env.AIAI_USERID);
      if (idx !== -1) {
        console.log("Triggering bot management code");
        await botManageChallenges();
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge",
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}

async function newStandingChallenge(userid: string, challenge: FullChallenge) {
  const challengeId = uuid();
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "duration": challenge.duration,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "players": [challenge.challenger], // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "rated": challenge.rated,
      "noExplore": challenge.noExplore || false,
      "comment": challenge.comment || "",
      "dateIssued": Date.now(),
    }
  }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c",
  }));

  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);

  try {
    await Promise.all([addChallenge, updateChallenger, updateStandingChallengeCnt]);
    console.log("Successfully added challenge" + challengeId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge",
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}

async function sendChallengedEmail(challengerName: string, opponents: User[], metaGameUid: string, comment: string | undefined) {
  const humanIds = await filterHumanIds(opponents.map((o: { id: any; }) => o.id));
  const players: FullUser[] = await getPlayers(humanIds);
  await initi18n('en');
  const work: Promise<any>[] = [];
  comment = comment ? comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
  for (const player of players) {
    await changeLanguageForPlayer(player);
    const metaGame = localizedGameName(metaGameUid);
    let body;
    if (comment === ".") {
      body = i18n.t("ChallengeBody", { "challenger": challengerName, metaGame });
    } else {
      body = i18n.t("ChallengeBodyComment", { "challenger": challengerName, metaGame, comment });
    }
    if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
      if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges)) {
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeSubject"), body);
        work.push(sesClient.send(comm));
      } else {
        console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
      }
    } else {
      console.log(`No verified email address found for ${player.name} (${player.id})`);
    }
    // push notifications are sent no matter what
    work.push(sendPush({
      userId: player.id,
      topic: "challenges",
      title: i18n.t("PUSH.titles.challenged"),
      body: body,
      url: "/",
    }));
  }
  return Promise.all(work);
}

async function revokeChallenge(userid: any, pars: { id: string; metaGame: string; standing: boolean; comment: string; }) {
  let challenge: Challenge | undefined;
  const work: Promise<any>[] = [];
  let work1: Promise<any> | undefined;
  try {
    ({ challenge, work: work1 } = await removeChallenge(pars.id, pars.metaGame, pars.standing === true, true, userid));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to remove challenge");
  }
  if (work1 !== undefined)
    work.push(work1);
  // send e-mails
  if (challenge) {
    let comment = pars.comment ? pars.comment.trim() : "";
    if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
      comment += ".";
    await initi18n('en');
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    let revokerName: string | undefined;
    let revokeNote: string | undefined;
    if (!pars.standing) {
      const revokerParts = await getParticipants([userid]);
      revokerName = revokerParts[0]?.name ?? challenge.challenger.name;
      revokeNote = optionalNotificationNote(pars.comment);
    }
    // Inform challenged
    if (challenge.challengees) {
      const players: FullUser[] = await getPlayers(await filterHumanIds(challenge.challengees.map((c: { id: any; }) => c.id)));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const metaGame = localizedGameName(challenge.metaGame);
        let body;
        if (comment === ".") {
          body = i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame });
        } else {
          body = i18n.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment });
        }
        if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
          if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges)) {
            const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: i18n.t("PUSH.titles.revoked"),
          body: body,
          url: "/",
        }));
        if (!pars.standing && revokerName !== undefined) {
          work.push(createNotification(ddbDocClient, tableName, player.id, {
            type: 'challengeRevoked',
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            revokerId: userid,
            revokerName,
            ...(revokeNote ? { note: revokeNote } : {}),
          }, {
            userSettings: player.settings as InAppNotificationUserSettings | undefined,
          }));
        }
      }
    }
    // Inform players that have already accepted
    if (challenge.players) {
      const players = await getPlayers(await filterHumanIds(challenge.players.map((c: { id: any; }) => c.id).filter((id: any) => id !== challenge!.challenger.id)));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const metaGame = localizedGameName(challenge.metaGame);
        let body;
        if (comment === ".") {
          body = i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame });
        } else {
          body = i18n.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment });
        }
        if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
          if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges)) {
            const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: i18n.t("PUSH.titles.revoked"),
          body: body,
          url: "/",
        }));
        if (!pars.standing && revokerName !== undefined) {
          work.push(createNotification(ddbDocClient, tableName, player.id, {
            type: 'challengeRevoked',
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            revokerId: userid,
            revokerName,
            ...(revokeNote ? { note: revokeNote } : {}),
          }, {
            userSettings: player.settings as InAppNotificationUserSettings | undefined,
          }));
        }
      }
    }
  }

  await Promise.all(work);
  console.log("Successfully removed challenge" + pars.id);
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Successfully removed challenge" + pars.id
    }),
    headers
  };
}

async function respondedChallenge(userid: string, pars: { response: boolean; id: string; standing?: boolean; metaGame: string; comment: string; }) {
  const response = pars.response;
  const challengeId = pars.id;
  const standing = pars.standing === true;
  const metaGame = pars.metaGame;
  console.log(`Responding to challenge standing = ${standing} ${metaGame}.${challengeId} for user ${userid}: ${response ? "accepted" : "rejected"}`);
  let comment = pars.comment ? pars.comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
  let ret: any;
  const work: Promise<any>[] = [];
  if (response) {
    // challenge was accepted
    let email;
    try {
      email = await acceptChallenge(userid, metaGame, challengeId, standing);
      console.log("Challenge" + challengeId + "successfully accepted.");
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge " + challengeId + " successfully accepted."
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to accept challenge");
    }
    if (email !== undefined) {
      console.log(email);
      await initi18n('en');
      try {
        for (const [ind, player] of email.players.entries()) {
          await changeLanguageForPlayer(player);
          const metaGameDisplay = localizedGameName(metaGame);
          let body = i18n.t("GameStartedBody", { metaGame: metaGameDisplay });
          if (ind === 0 || email.simultaneous) {
            body += " " + i18n.t("YourMove");
          }
          if (comment !== "." && player.id !== userid) {
            body += " " + i18n.t("ChallengeResponseComment", { comment });
          }
          if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
            if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameStart)) {
              const ebody = body + " " + i18n.t("GameLink", { metaGame: metaGame, gameId: email.gameId });
              const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameStartedSubject"), ebody);
              work.push(sesClient.send(comm));
            } else {
              console.log(`Player ${player.name} (${player.id}) has elected to not receive game start notifications.`);
            }
          } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
          }
          // push notifications are sent no matter what
          work.push(sendPush({
            userId: player.id,
            topic: "started",
            title: i18n.t("PUSH.titles.started"),
            body,
            url: "/",
          }));
        }
      } catch (err) {
        logGetItemError(err);
      }
    }
  } else {
    // challenge was rejected
    let challenge: Challenge | undefined;
    let work2: Promise<any> | undefined;
    try {
      ({ challenge, work: work2 } = await removeChallenge(pars.id, pars.metaGame, standing, false, userid));
      await work2;
      console.log("Successfully removed challenge " + pars.id);
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge " + pars.id
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to remove challenge");
    }
    // send e-mails
    if (challenge !== undefined) {
      await initi18n('en');
      // Inform everyone (except the decliner, he knows).
      const players: FullUser[] = await getPlayers(await filterHumanIds(challenge.challengees!.map(c => c.id).filter(id => id !== userid).concat(challenge.players.map(c => c.id))));
      const quitter = challenge.challengees!.find(c => c.id === userid)!.name;
      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      const declineNote = !standing ? optionalNotificationNote(pars.comment) : undefined;
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const metaGame = localizedGameName(challenge.metaGame);
        let body = i18n.t("ChallengeRejectedBody", { quitter, metaGame });
        if (comment !== ".") {
          body += " " + i18n.t("ChallengeResponseComment", { comment });
        }
        if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
          if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges)) {
            const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
          console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: i18n.t("PUSH.titles.declined"),
          body: body,
          url: "/",
        }));
        if (!standing) {
          work.push(createNotification(ddbDocClient, tableName, player.id, {
            type: 'challengeDeclined',
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            declinerId: userid,
            declinerName: quitter,
            ...(declineNote ? { note: declineNote } : {}),
          }, {
            userSettings: player.settings as InAppNotificationUserSettings | undefined,
          }));
        }
      }
    }
  }
  await Promise.all(work);
  return ret;
}

async function removeChallenge(challengeId: string, metaGame: string, standing: boolean, revoked: boolean, quitter: string) {
  const chall = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE",
        "sk": challengeId
      },
    }));
  if (chall.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return { "challenge": undefined, "work": undefined };
  }
  const challenge = chall.Item as Challenge;
  if (revoked && challenge.challenger.id !== quitter)
    throw new Error(`${quitter} tried to revoke a challenge that they did not create.`);
  if (!revoked && !(challenge.players.find((p: { id: any; }) => p.id === quitter) || (!standing && challenge.challengees!.find((p: { id: any; }) => p.id === quitter))))
    throw new Error(`${quitter} tried to leave a challenge that they are not part of.`);
  return { challenge, "work": removeAChallenge(challenge, standing, revoked, false, quitter) };
}

// Remove the challenge either because the game has started, or someone withrew: either challenger revoked the challenge or someone withdrew an acceptance, or didn't accept the challenge.
async function removeAChallenge(challenge: { [x: string]: any; challenger?: any; id?: any; challengees?: any; numPlayers?: any; metaGame?: any; players?: any; }, standing: any, revoked: boolean, started: boolean, quitter: string) {
  const list: Promise<any>[] = [];

  // determine if a standing challenge has expired
  let expired = false;
  if (standing && !revoked) {
    if (("duration" in challenge) && (typeof challenge.duration === "number") && (challenge.duration > 0)) {
      if (challenge.duration === 1) {
        expired = true;
      } else {
        console.log(`decrementing standing challenge ${challenge.metaGame + '#' + challenge.id} duration from ${challenge.duration} to ${challenge.duration - 1}`);
        list.push(
          ddbDocClient.send(
            new UpdateCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "STANDINGCHALLENGE#" + challenge.metaGame, "sk": challenge.id },
              ExpressionAttributeValues: { ":d": challenge.duration - 1 },
              ExpressionAttributeNames: { "#d": "duration" },
              UpdateExpression: "set #d = :d"
            })
          )
        );
      }
    }
  }

  if (!standing) {
    // Remove from challenger
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_issued :c",
      ExpressionAttributeValues: { ":c": new Set([challenge.id]) }
    })));
    // Remove from challenged
    for (const challengee of challenge.challengees) {
      if (!(await isBotId(challengee.id))) {
        list.push(sendCommandWithRetry(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          UpdateExpression: "DELETE challenges_received :c",
          ExpressionAttributeValues: { ":c": new Set([challenge.id]) }
        })));
      }
    }
  } else if (
    revoked
    || challenge.numPlayers > 2 // Had to duplicate the standing challenge when someone accepted but there were still spots left. Remove the duplicated standing challenge
    || expired
  ) {
    // Remove from challenger
    console.log(`removing duplicated challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from challenger ${challenge.challenger.id}`);
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_standing :c",
      ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challenge.id]) }
    })));
  }

  // Remove from players that have already accepted
  let playersToUpdate = [];
  if (standing || revoked || started) {
    playersToUpdate = challenge.players.filter((p: { id: any; }) => p.id != challenge.challenger.id);
  } else {
    playersToUpdate = [{ "id": quitter }];
  }
  for (const player of playersToUpdate) {
    if (await isBotId(player.id)) {
      continue;
    }
    console.log(`removing challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from ${player.id}`);
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": player.id },
      UpdateExpression: "DELETE challenges_accepted :c",
      ExpressionAttributeValues: { ":c": new Set([standing ? challenge.metaGame + '#' + challenge.id : challenge.id]) }
    })));
  }

  // Remove challenge
  if (!standing) {
    list.push(
      ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "CHALLENGE", "sk": challenge.id
          },
        }))
    );
  } else if (
    revoked
    || challenge.numPlayers > 2 // Had to duplicate the standing challenge when someone accepted but there were still spots left. Remove the duplicated standing challenge
    || expired
  ) {
    console.log(`removing challenge ${challenge.metaGame + '#' + challenge.id}`);
    list.push(
      ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "STANDINGCHALLENGE#" + challenge.metaGame, "sk": challenge.id
          },
        }))
    );

    list.push(updateStandingChallengeCount(challenge.metaGame, -1));
  }
  return Promise.all(list);
}

async function updateStandingChallengeCount(metaGame: any, diff: number) {
  await adjustShardedCounts(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    metaGame,
    { standingchallenges: diff },
  );
}

async function acceptChallenge(userid: string, metaGame: string, challengeId: string, standing: boolean) {
  const challengeData = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE", "sk": challengeId
      },
    }));

  if (challengeData.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }

  const challenge = challengeData.Item as FullChallenge;
  const challengees = standing || !challenge.challengees ? [] : challenge.challengees.filter((c: { id: any; }) => c.id != userid);
  if (!standing && challengees.length !== (challenge.challengees ? challenge.challengees.length : 0) - 1) {
    logGetItemError(`userid ${userid} wasn't a challengee, challenge ${challengeId}`);
    throw new Error("Can't accept a challenge if you weren't challenged");
  }
  const players = challenge.players;
  if ((players ? players.length : 0) === challenge.numPlayers - 1) {
    // Enough players accepted. Start game.
    const gameId = uuid();
    let playerIDs: string[] = [];
    if (challenge.seating === 'random') {
      playerIDs = players!.map(player => player.id) as string[];
      playerIDs.push(userid);
      shuffle(playerIDs);
    } else if (challenge.seating === 's1') {
      playerIDs.push(challenge.challenger.id);
      playerIDs.push(userid);
    } else if (challenge.seating === 's2') {
      playerIDs.push(userid);
      playerIDs.push(challenge.challenger.id);
    }
    const playersFull = await getParticipants(playerIDs);
    let whoseTurn: string | boolean[] = "0";
    const info = gameinfo.get(challenge.metaGame);
    if (info.flags !== undefined && info.flags.includes('simultaneous')) {
      whoseTurn = playerIDs.map(() => true);
    }
    const variants = challenge.variants;
    console.log(`Variants in the challenge object: ${JSON.stringify(variants)}`);
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory(challenge.metaGame, challenge.numPlayers, variants);
    else
      engine = GameFactory(challenge.metaGame, undefined, variants);
    if (!engine)
      throw new Error(`Unknown metaGame ${challenge.metaGame}`);
    console.log(`Variants in the game engine: ${JSON.stringify(engine.variants)}`);
    const state = engine.serialize();
    const now = Date.now();
    const gamePlayers = playersFull.map(p => { return { "id": p.id, "name": p.name, "time": challenge.clockStart * 3600000 } }) as User[];
    applyPerspectivePlayerRotations(
      gamePlayers as Array<{ settings?: { rotate?: number } }>,
      playerIDs.length,
      effectiveFlags(engine, challenge.metaGame, challenge.variants),
    );
    const addGame = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage({
        "pk": "GAME",
        "sk": challenge.metaGame + "#0#" + gameId,
        "id": gameId,
        "metaGame": challenge.metaGame,
        "numPlayers": challenge.numPlayers,
        "rated": challenge.rated === true,
        "players": gamePlayers,
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "noExplore": challenge.noExplore || false,
        "state": state,
        "toMove": whoseTurn,
        "lastMoveTime": now,
        "gameStarted": now,
        "variants": engine.variants,
      })
    }));
    const list: Promise<any>[] = [];
    list.push(addGame);
    list.push(removeAChallenge(challenge, standing, false, true, ''));

    try {
      await Promise.all(list);
      await notifyRegisteredBotsTurn(challenge.metaGame, gameId);
      await enqueueGameStartNotifications(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        {
          id: gameId,
          metaGame: challenge.metaGame,
          variants: engine.variants,
          players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
        },
        inAppSettingsMapFromUsers(playersFull),
      );
      return {
        metaGame: info.name,
        players: playersFull.filter(p => !p.isBot) as unknown as FullUser[],
        simultaneous: info.flags !== undefined && info.flags.includes('simultaneous'),
        gameId
      };
    }
    catch (error) {
      logGetItemError(error);
      throw new Error('Unable to update players and create game');
    }
  } else {
    // Still waiting on more players to accept.
    // Update challenge
    let newplayer: User | undefined;
    if (standing) {
      const playerFull = await getParticipants([userid]);
      newplayer = { "id": playerFull[0].id, "name": playerFull[0].name };
    } else {
      newplayer = challenge.challengees!.find(c => c.id == userid);
      if (!newplayer)
        throw new Error("Can't accept a challenge if you weren't challenged");
    }
    let updateChallenge: Promise<any>;
    if (!standing || challenge.numPlayers == 2 || (players && players.length !== 1)) {
      challenge.challengees = challengees;
      players!.push(newplayer);
      updateChallenge = ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: challenge
      }));
    } else {
      // need to duplicate the challenge, because numPlayers > 2 and we have our first accepter
      ({ challengeId, work: updateChallenge } = await duplicateStandingChallenge(challenge, newplayer));
    }
    // Update accepter
    const challengeValue = new Set([standing ? challenge.metaGame + '#' + challengeId : challengeId]);

    const userUpdates: Promise<any>[] = [updateChallenge];
    if (!(await isBotId(userid))) {
      userUpdates.push(sendCommandWithRetry(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        UpdateExpression: "DELETE challenges_received :c",
        ExpressionAttributeValues: { ":c": challengeValue }
      })));
      userUpdates.push(sendCommandWithRetry(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        UpdateExpression: "ADD challenges_accepted :c",
        ExpressionAttributeValues: { ":c": challengeValue }
      })));
    }

    await Promise.all(userUpdates);
    return;
  }
}

async function duplicateStandingChallenge(challenge: { [x: string]: any; metaGame?: any; numPlayers?: any; standing?: any; seating?: any; variants?: any; challenger?: any; clockStart?: any; clockInc?: any; clockMax?: any; clockHard?: any; rated?: any; }, newplayer: any) {
  const challengeId = uuid();
  console.log("Duplicate challenge with newplayer", newplayer);
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: {
      "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
      "sk": challengeId,
      "id": challengeId,
      "metaGame": challenge.metaGame,
      "numPlayers": challenge.numPlayers,
      "standing": challenge.standing,
      "seating": challenge.seating,
      "variants": challenge.variants,
      "challenger": challenge.challenger,
      "players": [challenge.challenger, newplayer], // users that have accepted
      "challengees": [challenge.challenger, newplayer], // users that have accepted
      "clockStart": challenge.clockStart,
      "clockInc": challenge.clockInc,
      "clockMax": challenge.clockMax,
      "clockHard": challenge.clockHard,
      "noExplore": challenge.noExplore || false,
      "rated": challenge.rated,
      "dateIssued": challenge.dateIssued,
    }
  }));

  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": challenge.challenger.id },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c",
  }));

  return { challengeId, "work": Promise.all([addChallenge, updateStandingChallengeCnt, updateChallenger]) };
}


async function inAppSettingsMapForUserIds(userIds: string[]) {
  const players = await getPlayers(await filterHumanIds(userIds));
  return inAppSettingsMapFromUsers(players);
}

async function getPlayersSlowly(playerIDs: string[]) {
  const players: FullUser[] = [];
  for (const id of playerIDs) {
    try {
      if (await isBotId(id)) {
        const bot = await getBotRecord(id);
        if (bot) {
          players.push(botToFullUserStub(bot) as FullUser);
        }
        continue;
      }
      const playerData = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER", "sk": id
          },
        })
      );
      if (playerData.Item) {
        players.push(playerData.Item as FullUser);
      }
    } catch (error) {
      logGetItemError(error);
      console.log(`Unable to get player ${id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
      throw error;
    }
  }
  return players;
}

async function submitMove(userid: string, pars: {
  id: string, move: string, draw: string, metaGame: string, cbit: number, moveNumber?: number, opponentId?: string,
  exploration?: Exploration[]
}) {
  if (pars.cbit !== 0) {
    return formatReturnError("cbit must be 0");
  }

  // Build parallel fetch promises
  const gamePromise = sendCommandWithRetry<GetCommandOutput>(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "GAME",
        "sk": pars.metaGame + "#0#" + pars.id
      },
    }));

  // If opponentId and moveNumber are provided, also fetch opponent exploration data
  let opponentExplorationPromise: Promise<GetCommandOutput> | null = null;
  if (pars.opponentId && pars.moveNumber !== undefined) {
    opponentExplorationPromise = sendCommandWithRetry<GetCommandOutput>(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.id,
          "sk": pars.opponentId + "#" + pars.moveNumber
        },
      }));
  }

  let data: any;
  let opponentExplorationData: any = null;
  try {
    if (opponentExplorationPromise) {
      [data, opponentExplorationData] = await Promise.all([gamePromise, opponentExplorationPromise]);
    } else {
      data = await gamePromise;
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
    const game = hydrateGameState(data.Item as FullGame);
    console.log("got game in submitMove:");
    console.log(game);
    const engine = GameFactory(game.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game.metaGame}`);

    // Validate moveNumber if provided (to catch stale browser submissions)
    const currentMoveNumber = engine.stack.length;
    if (pars.moveNumber !== undefined && pars.moveNumber !== currentMoveNumber) {
      return formatReturnError(`Move number mismatch: browser has ${pars.moveNumber} moves but game has ${currentMoveNumber} moves. Please refresh your browser.`);
    }

    // Parse explorations if fetched (for premove processing)
    let opponentExploration: Exploration[] | null = null;
    if (opponentExplorationData?.Item?.tree) {
      try {
        opponentExploration = JSON.parse(opponentExplorationData.Item.tree as string);
      } catch (error) {
        console.log(`Error parsing opponent exploration tree: ${error}`);
        // Non-fatal, continue without premove processing
      }
    }

    const flags = structuralFlags(game.metaGame);
    const simultaneous = flagSetIncludes(flags, "simultaneous");
    const sessionFlags = effectiveFlags(engine, game.metaGame, game.variants);
    const lastMoveTime = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();
    let autoMoves = 0;
    let autoMovesPerPlayer: number[] = [];
    const list: Promise<any>[] = [];

    try {
      if (pars.move === "resign") {
        resign(userid, engine, game);
      } else if (pars.move === "timeout") {
        timeout(userid, engine, game);
      } else if (pars.move === "" && pars.draw === "drawaccepted") {
        drawaccepted(userid, engine, game, simultaneous);
      } else if (simultaneous) {
        applySimultaneousMove(userid, pars.move, engine as GameBaseSimultaneous, game);
      } else {
        const result = applyMove(userid, pars.move, currentMoveNumber, engine, game, [...sessionFlags], opponentExploration, pars.exploration);
        autoMoves = result.autoMoves;
        autoMovesPerPlayer = result.autoMovesPerPlayer;
        for (const workItem of result.work) {
          list.push(workItem);
        }
      }
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to apply move ${pars.move}`, error);
    }

    const player = game.players.find(p => p.id === userid);
    if (!player)
      throw new Error(`Player ${userid} isn't playing in game ${pars.id}`)
    // deal with draw offers
    if (pars.draw === "drawoffer" && autoMoves === 0) {
      player.draw = "offered";
    } else {
      // if a player just moved, other draw offers are declined
      game.players.forEach(p => delete p.draw);
    }
    const timestamp = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();
    const timeUsed = timestamp - lastMoveTime;
    // console.log("timeUsed", timeUsed);
    // console.log("player", player);
    if (player.time! - timeUsed < 0)
      player.time = game.clockInc * 3600000; // If the opponent didn't claim a timeout win, and player moved, pretend his remaining time was zero.
    else
      player.time = player.time! - timeUsed + game.clockInc * 3600000;
    if (player.time > game.clockMax * 3600000) player.time = game.clockMax * 3600000;
    // Apply time increments for players whose moves were auto-applied (forced moves or premoves)
    for (let i = 0; i < autoMovesPerPlayer.length; i++) {
      if (autoMovesPerPlayer[i] > 0) {
        game.players[i].time = (game.players[i].time || 0) + autoMovesPerPlayer[i] * game.clockInc * 3600000;
        if (game.players[i].time! > game.clockMax * 3600000) game.players[i].time = game.clockMax * 3600000;
      }
    }
    // console.log("players", game.players);
    const playerIDs = game.players.map((p: { id: any; }) => p.id);
    // TODO: We are updating players and their games. This should be put in some kind of critical section!
    const players = await getParticipants(playerIDs);

    // this should be all the info we want to show on the "my games" summary page.
    const playerGame = {
      "id": game.id,
      "metaGame": game.metaGame,
      "players": game.players,
      "clockHard": game.clockHard,
      "noExplore": game.noExplore || false,
      "lastMoveTime": timestamp,
      "numMoves": engine.stack.length - 1,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "variants": engine.variants
    } as Game;
    if (engine.gameover) {
      playerGame.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
      playerGame.winner = engine.winner;
    }
    if ((game.toMove === "" || game.toMove === null)) {
      // delete at old sk
      list.push(sendCommandWithRetry<DeleteCommandOutput>(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": game.sk
          }
        })
      ));
      console.log("Scheduled delete and updates to game lists");
      game.sk = game.metaGame + "#1#" + game.id;

      /*
            As originally conceived, notes were part of the PLAYER record and were thus retained
            until the game was cleared from the record. But when moving them to a separate record,
            now they're being deleted immediately. So for now, let's not delete the notes until
            I can find a way to schedule deletions.
       */
      // TODO: Find a way to schedule deletions
      // delete associated notes
      //   try {
      //     const notesData = await ddbDocClient.send(
      //         new QueryCommand({
      //           TableName: process.env.ABSTRACT_PLAY_TABLE,
      //           KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      //           ExpressionAttributeValues: { ":pk": "NOTE", ":sk": game.id },
      //           ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      //           ProjectionExpression: "#pk, #sk"
      //     }));
      //     if ( (notesData.Items) && (notesData.Items.length > 0) ) {
      //         const notesList = notesData.Items as Note[];
      //         for (const note of notesList) {
      //             list.push(ddbDocClient.send(
      //                 new DeleteCommand({
      //                   TableName: process.env.ABSTRACT_PLAY_TABLE,
      //                   Key: {
      //                     "pk": note.pk,
      //                     "sk": note.sk
      //                   }
      //                 })
      //             ));
      //         }
      //     }
      //   } catch (err) {
      //     logGetItemError(err);
      //     return formatReturnError('Unable to process submit move');
      //   }
      if (game.tournament !== undefined) {
        list.push(tournamentUpdates(game, players as unknown as FullUser[], pars.move === "timeout" ? parseInt(game.toMove) : undefined));
      }
      if (game.event !== undefined) {
        const winners = engine.winner.map(n => players[n - 1]).map(p => p.id);
        list.push(eventUpdates({ eventid: game.event, gameid: pars.id, winner: winners }))
      }
      list.push(enqueueGameEndNotifications(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        toNotificationGame(
          { ...game, winner: engine.winner, variants: engine.variants },
          collectGameEndScoresFromEngine(
            engine,
            flagSetIncludes(effectiveFlags(engine, game.metaGame, game.variants), 'scores'),
          ),
        ),
        inAppSettingsMapFromUsers(players),
      ));
    }
    setGameEndedFromEngine(game, engine);
    game.numMoves = engine.stack.length - 1;
    game.lastMoveTime = timestamp;
    const updateGame = sendCommandWithRetry<PutCommandOutput>(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game)
    }));
    list.push(updateGame);
    console.log("Scheduled update to game");
    // Update players
    for (let ind = 0; ind < players.length; ind++) {
      const player = players[ind];
      if (player.isBot) {
        continue;
      }
      if (player.id === userid && (game.toMove === "" || game.toMove === null)) {
        const seen = Date.now();
        list.push(upsertUserGameOverlay(
          ddbDocClient,
          process.env.ABSTRACT_PLAY_TABLE!,
          player.id,
          playerGame.id,
          { seen },
        ));
      }
    }

    list.push(updateWatcherSummaries(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      game.id,
      playerGame as GameMarkSummary,
    ));

    if (simultaneous)
      game.partialMove = game.players.map((p: User, i: number) => (p.id === userid ? game.partialMove!.split(',')[i] : '')).join(',');

    list.push(sendSubmittedMoveEmails(game, players.filter(p => !p.isBot) as unknown as FullUser[], simultaneous));
    console.log("Scheduled emails");

    await realPingBot(game.metaGame, game.id, game);
    await Promise.all(list);

    // broadcasting that state has updated
    await wsBroadcast("game", { "meta": pars.metaGame, "id": pars.id }, [userid]);

    // TODO: Rehydrate state, run it through the stripper, and then replace with the new, stripped state
    if (game.gameEnded === undefined) {
      const engine = GameFactory(game.metaGame, game.state);
      if (engine === undefined) {
        throw new Error(`Could not rehydrate the state for id "${pars.id}", meta "${pars.metaGame}".`);
      }
      if (!engine.gameover) {
        let player: number | undefined;
        const pidx = game.players.findIndex(p => p.id === userid);
        if (pidx >= 0) {
          player = pidx + 1;
        }
        game.state = engine.serialize({ strip: true, player });
      }
    }

    console.log("All updates complete");
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to process submit move');
  }
}

async function tournamentUpdates(game: FullGame, players: FullUser[], timeout: number | undefined) {
  let work: Promise<any>[] = [];
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    let score = 0;
    if (game.winner?.length === 1 && game.players[game.winner[0] - 1].id === player.id) {
      score = 1;
    } else if (game.winner?.length === 2) {
      score = 0.5;
    }
    console.log(`player ${player.name} now has score ${score} in game ${game.id} from tournament ${game.tournament}`);
    work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTPLAYER", "sk": game.tournament + '#' + game.division!.toString() + '#' + player.id },
      ExpressionAttributeNames: { "#s": "score", "#t": "timeout" },
      ExpressionAttributeValues: { ":inc": score, ":t": i === timeout },
      UpdateExpression: "add #s :inc set #t = :t"
    })));
  }
  const winner = game.winner?.map((w: number) => game.players[w - 1].id);
  work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENTGAME", "sk": game.tournament + '#' + game.division!.toString() + '#' + game.id },
    ExpressionAttributeNames: { "#w": "winner" },
    ExpressionAttributeValues: { ":w": winner },
    UpdateExpression: "set #w = :w"
  })));
  const tournamentData = await sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENT", "sk": game.tournament },
    ExpressionAttributeNames: { "#d": "divisions", "#n": game.division!.toString() },
    ExpressionAttributeValues: { ":inc": 1, ":zero": 0 },
    UpdateExpression: "set #d.#n.numCompleted = if_not_exists(#d.#n.numCompleted, :zero) + :inc",
    ReturnValues: "ALL_NEW"
  }));
  const tournament = tournamentData.Attributes as Tournament;
  let divisionCompleted = false;
  for (const division of Object.values(tournament.divisions!)) {
    if (division.numCompleted === division.numGames && !division.processed) {
      divisionCompleted = true;
      break;
    }
  }
  if (divisionCompleted) {
    console.log("division completed, processing tournament");
    await Promise.all(work);
    work = [];
    work.push(endTournament(tournament))
  }
  return Promise.all(work);
}

async function sendSubmittedMoveEmails(game: FullGame, players0: FullUser[], simultaneous: any) {
  await initi18n('en');
  const work: Promise<any>[] = [];
  if (game.toMove !== '') {
    let playerIds: any[] = [];
    if (!simultaneous) {
      playerIds.push(game.players[parseInt(game.toMove as string)].id);
    }
    else if ((game.toMove as boolean[]).every(b => b === true)) {
      playerIds = game.players.map(p => p.id);
    }
    const players = players0.filter(p => playerIds.includes(p.id));
    // Realtime YourTurn notifications are only sent by push (not for solo games — always your turn)
    if (game.numPlayers !== 1) {
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const metaGame = localizedGameName(game.metaGame);
        work.push(sendPush({
          userId: player.id,
          topic: "yourturn",
          title: i18n.t("PUSH.titles.yourturn"),
          body: i18n.t("YourMoveBody", { metaGame }),
          url: `/move/${game.metaGame}/0/${game.id}`,
        }));
      }
    }
  } else {
    // Game over
    const playerIds = game.players.map((p: { id: any; }) => p.id);
    const players = players0.filter((p: { id: any; }) => playerIds.includes(p.id));
    const engine = GameFactory(game.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game.metaGame}`);
    const scores = collectGameEndScoresFromEngine(
      engine,
      flagSetIncludes(effectiveFlags(engine, game.metaGame, game.variants), 'scores'),
    );

    for (const player of players) {
      await changeLanguageForPlayer(player);
      const metaGame = localizedGameName(game.metaGame);
      // The Game Over email has a few components:
      const body = [];
      //   - Initial line
      body.push(i18n.t("GameOverBody", { metaGame }));
      //   - Winner statement
      let result = "lose";
      if (engine.winner.length > 1) {
        result = "draw";
      } else if (engine.winner.length === 1) {
        const winner = playerIds[engine.winner[0] - 1];
        if (winner === player.id) {
          result = "win";
        }
      }
      body.push(i18n.t("GameOverResult", { context: result }));
      //   - Final scores, if applicable
      if (scores !== undefined && scores.length > 0) {
        body.push(i18n.t("GameOverScores", { scores: formatNotificationScores(scores) }))
      }
      //   - Direct link to game
      body.push(i18n.t("GameOverLink", { metaGame: game.metaGame, gameID: game.id }));

      if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
        if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameEnd)) {
          const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), body.join(" "));
          work.push(sesClient.send(comm));
        } else {
          console.log(`Player ${player.name} (${player.id}) has elected to not receive game end notifications.`);
        }
      } else {
        console.log(`No verified email address found for ${player.name} (${player.id})`);
      }
      // push notifications are sent no matter what
      work.push(sendPush({
        userId: player.id,
        topic: "ended",
        title: i18n.t("PUSH.titles.ended"),
        body: body.join(" "),
        url: `/move/${game.metaGame}/1/${game.id}`,
      }));
    }
  }
  return Promise.all(work);
}

function resign(userid: any, engine: GameBase, game: FullGame) {
  const player = game.players.findIndex((p: { id: any; }) => p.id === userid);
  if (player === undefined)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  game.state = engine.serialize();
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  } else {
    const flags = structuralFlags(game.metaGame);
    const simultaneous = flagSetIncludes(flags, "simultaneous");
    if (simultaneous) {
      applySimultaneousMove(userid, "resign", engine as GameBaseSimultaneous, game);
    } else {
      applyMove(userid, "resign", -1, engine, game, [...effectiveFlags(engine, game.metaGame, game.variants)]);
    }
  }
}

function timeout(userid: string, engine: GameBase | GameBaseSimultaneous, game: FullGame) {
  if (game.toMove === '')
    throw new Error("Can't timeout a game that has already ended");
  // Find player that timed out
  let loser: number;
  if (Array.isArray(game.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = Date.now() - game.lastMoveTime;
    game.toMove.forEach((p: any, i: number) => {
      if (p && game.players[i].time! - elapsed < minTime) {
        minTime = game.players[i].time! - elapsed;
        minIndex = i;
      }
    });
    if (minIndex !== -1) {
      loser = minIndex;
    } else {
      throw new Error("Nobody's time is up!");
    }
  } else {
    if (game.players[parseInt(game.toMove)].time! - (Date.now() - game.lastMoveTime) < 0) {
      loser = parseInt(game.toMove);
    } else {
      throw new Error("Opponent's time isn't up!");
    }
  }
  engine.timeout(loser + 1);
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  } else {
    const loserid = game.players[loser].id;
    const flags = structuralFlags(game.metaGame);
    const simultaneous = flagSetIncludes(flags, "simultaneous");
    if (simultaneous) {
      applySimultaneousMove(loserid, "timeout", engine as GameBaseSimultaneous, game);
    } else {
      applyMove(loserid, "timeout", -1, engine, game, [...effectiveFlags(engine, game.metaGame, game.variants)]);
    }
  }
}

function drawaccepted(userid: string, engine: GameBase, game: FullGame, simultaneous: boolean) {
  if ((!simultaneous && game.players[parseInt(game.toMove as string)].id !== userid) || (simultaneous && !game.players.some((p: User, i: number) => game.toMove[i] && p.id === userid))) {
    throw new Error('It is not your turn!');
  }
  const player = game.players.find((p: { id: any; }) => p.id === userid);
  if (!player)
    throw new Error("You can't accept a draw in a game you aren't playig in!");
  player.draw = "accepted";
  if (game.players.every(p => p.draw === "offered" || p.draw === "accepted")) {
    engine.draw();
    game.state = engine.serialize();
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  }
}

async function botMove(pars: { uid: string, token: string, metaGame: string, gameid: string, move: string }) {
  try {
    if (!validateToken(process.env.TOTP_KEY as string, pars.token, 2)) {
      return formatReturnError(`Invalid token provided: ${JSON.stringify(pars)}`);
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Something went wrong while validating the token: ${JSON.stringify(pars)}`);
  }

  let gameRecord: FullGame | undefined;
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'GAME',
          sk: pars.metaGame + '#0#' + pars.gameid,
        },
      }));
    if (!data.Item) {
      throw new Error(`No game ${pars.metaGame + '#0#' + pars.gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    gameRecord = hydrateGameState(data.Item as FullGame);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to load game ${pars.gameid} to make a bot move`);
  }

  if (gameRecord === undefined) {
    throw new Error('Unable to load game object');
  }
  const engine = GameFactory(pars.metaGame, gameRecord.state);
  if (!engine) {
    throw new Error(`Unknown metaGame ${pars.metaGame}`);
  }

  if (pars.move === 'Swap') {
    return await invokePie(pars.uid, { id: pars.gameid, metaGame: pars.metaGame, cbit: 0 });
  }
  if (pars.move === 'resign') {
    return await submitMove(pars.uid, { id: pars.gameid, move: pars.move, metaGame: pars.metaGame, cbit: 0, draw: '' });
  }

  const realmove = engine.translateAiai(pars.move);

  if (realmove === 'Swap') {
    return await invokePie(pars.uid, { id: pars.gameid, metaGame: pars.metaGame, cbit: 0 });
  }

  return await submitMove(pars.uid, { id: pars.gameid, move: realmove, metaGame: pars.metaGame, cbit: 0, draw: '' });
}

async function checkForAbandonedGame(userid: string, pars: { id: string, metaGame: string }) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    throw new Error(`Unable to get game ${pars.metaGame}, ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.metaGame}, ${pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);

  try {
    const game = hydrateGameState(data.Item as FullGame);
    const playerIDs = game.players.map((p: { id: string }) => p.id);
    const humanIds = await filterHumanIds(playerIDs);
    const lastSeenByUser = await getUsersLastSeen(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      humanIds,
    );
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (
      game.toMove == ""
      || game.clockHard
      || [...lastSeenByUser.values()].some(lastSeen => lastSeen !== undefined && lastSeen > now - thirtyDaysMs)
      || game.lastMoveTime > now - thirtyDaysMs
    ) {
      return {
        statusCode: 200,
        body: "not_abandoned",
        headers
      };
    }
    const engine = GameFactory(game.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game.metaGame}`);
    engine.abandoned();
    game.state = engine.serialize();
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
    game.lastMoveTime = now;
    setGameEndedFromEngine(game, engine);

    // this should be all the info we want to show on the "my games" summary page.
    const playerGame = {
      "id": game.id,
      "metaGame": game.metaGame,
      "players": game.players,
      "clockHard": game.clockHard,
      "noExplore": game.noExplore || false,
      "winner": game.winner,
      "toMove": game.toMove,
      "lastMoveTime": game.lastMoveTime,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
      "numMoves": engine.stack.length - 1,
      "variants": engine.variants,
    } as Game;
    const work: Promise<any>[] = [];

    // delete at old sk
    work.push(ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": game.sk
        }
      })
    ));
    console.log("Scheduled delete and updates to game lists");
    game.sk = game.metaGame + "#1#" + game.id;

    work.push(ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game)
    })));

    work.push(updateWatcherSummaries(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      game.id,
      playerGame as GameMarkSummary,
    ));
    const abandonedGameEndSettings = await inAppSettingsMapForUserIds(
      game.players.map((p: { id: string }) => p.id),
    );
    work.push(enqueueGameEndNotifications(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      toNotificationGame(
        game,
        collectGameEndScoresFromEngine(
          engine,
          flagSetIncludes(effectiveFlags(engine, game.metaGame, game.variants), 'scores'),
        ),
      ),
      abandonedGameEndSettings,
    ));
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError('Error in checking for abandoned game');
  }
}

async function checkForTimeloss(userid: string, pars: { id: string, metaGame: string }) {
  try {
    const game = await timeloss(true, -1, pars.id, pars.metaGame, Date.now());
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    // eslint-disable-next-line no-constant-condition
    if (error === "Nobody's time is up!" || error === "Opponent's time isn't up!" || "Game is already over!") {
      return {
        statusCode: 200,
        body: "not_a_timeloss",
        headers
      };
    }
    logGetItemError(error);
    return formatReturnError('Unable to process check for timeloss');
  }
}

function applySimultaneousMove(userid: string, move: string, engine: GameBaseSimultaneous, game: FullGame) {
  const partialMove = game.partialMove;
  const moves = partialMove === undefined ? game.players.map(() => '') : partialMove.split(',');
  let cnt = 0;
  let found = false;
  for (let i = 0; i < game.numPlayers; i++) {
    if (game.players[i].id === userid) {
      found = true;
      if (moves[i] !== '' || !game.toMove[i]) {
        throw new Error('You have already submitted your move for this turn!');
      }
      moves[i] = move;
      (game.toMove as boolean[])[i] = false;
    }
    // check if current player is eliminated and insert a blank move
    // all simultaneous games should accept the character U+0091 as a blank move for eliminated players
    if (engine.isEliminated(i + 1)) {
      moves[i] = '\u0091';
    }
    if (moves[i] !== '')
      cnt++;
  }
  if (!found) {
    throw new Error('You are not participating in this game!');
  }
  if (cnt < game.numPlayers) {
    // not a complete "turn" yet, just validate and save the new partial move
    game.partialMove = moves.join(',');
    console.log(game.partialMove);
    engine.move(game.partialMove, { partial: true });
  }
  else {
    // full move.
    engine.move(moves.join(','));
    game.state = engine.serialize();
    game.partialMove = game.players.map(() => '').join(',');
    if (engine.gameover) {
      game.toMove = "";
      game.winner = engine.winner;
      game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
    }
    else {
      game.toMove = game.players.map((p, i) => !engine.isEliminated(i + 1));
    }
  }
}

// Helper to find a child in exploration that matches a move using engine.sameMove
function findExplorationChild(exploration: Exploration[] | null | undefined, move: string, engine: GameBase): Exploration | null {
  if (!exploration) return null;
  for (const child of exploration) {
    try {
      // @ts-ignore - sameMove exists on game engines
      if (engine.sameMove(move, child.move as unknown as string)) {
        return child;
      }
    } catch {
      // Incompatible or partial exploration branch — not a match
    }
  }
  return null;
}

// Helper to find a premove child in exploration
function findPremoveChild(exploration: Exploration[] | null | undefined): Exploration | null {
  if (!exploration) return null;
  return exploration.find(child => child.premove === true) || null;
}

// Helper to apply forced moves (automove/autopass) and return true if any were applied
function findForcedMove(engine: GameBase, flags: string[]): string {
  let forcedMove = null;
  if (flags !== undefined && flags.includes("automove") && !engine.gameover) {
    // @ts-ignore
    if (engine.moves().length === 1 && !(flags.includes("pie-even") && engine.state().stack.length === 2)) {
      // @ts-ignore
      forcedMove = engine.moves()[0];
      console.log(`Found forced move: ${forcedMove}`);
    }
  } else if (flags !== undefined && flags.includes("autopass") && !engine.gameover) {
    // @ts-ignore
    if (engine.moves().length === 1 && engine.moves()[0] === "pass" && !(flags.includes("pie-even") && engine.state().stack.length === 2)) {
      console.log(`Applying forced pass`);
      // @ts-ignore
      forcedMove = engine.moves()[0];
      console.log(`Found forced move: ${forcedMove}`);
    }
  }
  return forcedMove;
}

function applyMove(
  userid: string,
  move: string,
  moveNumber: number,
  engine: GameBase,
  game: FullGame,
  flags: string[],
  opponentExploration: Exploration[] | null = null,
  myExploration: Exploration[] | null = null
): { autoMoves: number, autoMovesPerPlayer: number[], work: Promise<any>[] } {
  // non simultaneous move game.
  if (game.players[parseInt(game.toMove as string)].id !== userid) {
    throw new Error('It is not your turn!');
  }

  const myPlayerIndex = parseInt(game.toMove as string);
  const opponentPlayerIndex = 1 - myPlayerIndex;

  // Track exploration positions for both players
  // explorations[0] is player 0's current exploration node children, explorations[1] is player 1's
  const explorations: (Exploration[] | null)[] = [null, null];
  explorations[myPlayerIndex] = myExploration;
  explorations[opponentPlayerIndex] = opponentExploration;
  console.log(`My explorations: ${JSON.stringify(explorations[myPlayerIndex])}, Opponent explorations: ${JSON.stringify(explorations[opponentPlayerIndex])}`);
  let autoMoves = 0;
  const autoMovesPerPlayer: number[] = new Array(game.players.length).fill(0);

  // Apply the initial submitted move
  console.log(`Applying submitted move: ${move}`);
  engine.move(move);

  // Main loop: handle forced moves and premoves until no more can be applied
  while (!engine.gameover && move) {
    // Update both explorations based on the applied move
    explorations[0] = findExplorationChild(explorations[0], move, engine)?.children || null;
    explorations[1] = findExplorationChild(explorations[1], move, engine)?.children || null;

    // First, apply any forced moves (automove/autopass)
    move = findForcedMove(engine, flags);
    if (!move) {
      // Check if there's a premove for the current player
      // @ts-ignore
      const currentPlayerIndex = engine.currplayer - 1;
      const currentExploration = explorations[currentPlayerIndex];
      const premoveNode = findPremoveChild(currentExploration);
      if (premoveNode) {
        move = premoveNode.move as unknown as string;
        console.log(`Applying premove for player ${currentPlayerIndex}: ${move}`);
      }
    }
    if (move) {
      // @ts-ignore
      const movedPlayerIndex = engine.currplayer - 1;
      try {
        engine.move(move);
        autoMoves += 1;
        autoMovesPerPlayer[movedPlayerIndex] += 1;
      } catch (e) {
        console.log(`Premove ${move} is invalid!: ${e}`);
        break;
      }
    }
  }

  const work: Promise<any>[] = [];
  if (!engine.gameover) {
    if (explorations[0] && explorations[0].length > 0) {
      // save back the updated exploration for player 0
      work.push(sendCommandWithRetry<PutCommandOutput>(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAMEEXPLORATION#" + game.id,
          "sk": game.players[0].id + "#" + (moveNumber + 1 + autoMoves),
          "user": game.players[0].id,
          "game": game.id,
          "move": (moveNumber + 1 + autoMoves),
          "tree": JSON.stringify(explorations[0])
        }
      })));
    }
    if (explorations[1] && explorations[1].length > 0) {
      // save back the updated exploration for player 1
      work.push(sendCommandWithRetry<PutCommandOutput>(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAMEEXPLORATION#" + game.id,
          "sk": game.players[1].id + "#" + (moveNumber + 1 + autoMoves),
          "user": game.players[1].id,
          "game": game.id,
          "move": (moveNumber + 1 + autoMoves),
          "tree": JSON.stringify(explorations[1])
        }
      })));
    }
  }

  game.state = engine.serialize();
  game.numMoves = engine.state().stack.length - 1;
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
  } else {
    if ((!("currplayer" in engine)) || (engine.currplayer === undefined) || (engine.currplayer === null) || (typeof engine.currplayer !== "number")) {
      throw new Error("The engine must provide a current player for `applyMove()` to be able to function.");
    }
    game.toMove = `${engine.currplayer - 1}`;
  }
  return { autoMoves, autoMovesPerPlayer, work };
}

function isInterestingComment(comment: string): boolean {
  if (!comment || comment.trim().length === 0) {
    return false;
  }
  // Normalize the comment
  const normalized = comment.toLowerCase().trim();

  // Remove punctuation for comparison
  const withoutPunctuation = normalized.replace(/[^\w\s]/g, '');

  // Common boring phrases (exact matches)
  const boringPhrases = new Set([
    'gg', 'glhf', 'gl', 'hf', 'tagg', 'hi', 'hello', 'hey',
    'thanks', 'thx', 'ty', 'yw', 'np', 'wp', 'well played',
    'good game', 'good luck', 'have fun', 'thanks for the game',
    'pie invoked', 'move', 'gg sir', 'gg!', 'tagg!', 'glhf!',
    'to a good game', 'have a good game', 'good luck!', 'have fun!',
    'thanks for playing', 'thanks for the game!', 'gg thanks',
    'yoyo', 'yoyo gl', 'yoyo gl hf'
  ]);

  // Check for exact matches (with or without punctuation)
  if (boringPhrases.has(normalized) || boringPhrases.has(withoutPunctuation)) {
    return false;
  }

  // Split into words for further analysis
  const words = withoutPunctuation.split(/\s+/).filter(w => w.length > 0);

  // Very short comments with only common game words are boring
  const commonWords = new Set([
    'gg', 'gl', 'hf', 'tagg', 'hi', 'hello', 'yoyo',
    'thanks', 'thx', 'ty', 'wp', 'move', 'pie', 'invoked',
    'good', 'game', 'luck', 'fun', 'for', 'the', 'a', 'to',
    'have', 'sir', 'well', 'played', 'you', 'too'
  ]);

  if (words.length <= 3 && words.every(w => commonWords.has(w))) {
    return false;
  }

  // If we got here, the comment is interesting
  return true;
}

// Helper function to update lastChat and seen for active dashboard games
async function updateLastChatForPlayers(
  gameId: string,
  metaGame: string,
  players: { [k: string]: any; id: string }[],
  currentUserId: string,
) {
  console.log(`Updating lastChat for all players of game ${gameId}`);

  const now = Date.now();
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;

  for (const pid of players.map(p => p.id)) {
    if (await isBotId(pid)) {
      continue;
    }
    let data: any;
    let user: FullUser | undefined;
    try {
      data = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER",
            "sk": pid
          },
        })
      );
      if (data.Item !== undefined) {
        user = data.Item as FullUser;
      }
    } catch (err) {
      logGetItemError(err);
      console.log(`Unable to get user data for user ${pid} when updating lastChat`);
      continue;
    }

    if (user === undefined) {
      console.log(`Unable to get user data for user ${pid} when updating lastChat`);
      continue;
    }

    const onCurrent = await hasCurrentGameRow(ddbDocClient, tableName, pid, gameId);

    if (onCurrent) {
      const overlay = { lastChat: now } as { lastChat: number; seen?: number };
      if (pid === currentUserId) {
        overlay.seen = now + 10;
      }
      await upsertUserGameOverlay(
        ddbDocClient,
        tableName,
        pid,
        gameId,
        overlay,
      );
      console.log(`Updated lastChat for user ${user.name} on game ${gameId}`);
    } else {
      console.log(`User ${user.name} does not have active game ${gameId} on dashboard; skipping overlay update`);
    }
  }
  await updateLastChatForWatchers(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    gameId,
    currentUserId,
  );
}

async function submitComment(userid: string, pars: { id: string; metaGame: string; players?: { [k: string]: any; id: string }[]; comment: string; moveNumber: number; }) {
  // reject empty comments
  if ((pars.comment.length === 0) || (/^\s*$/.test(pars.comment))) {
    return formatReturnError(`Refusing to accept blank comment.`);
  }
  if (!pars.metaGame) {
    return formatReturnError(`metaGame is required.`);
  }

  try {
    const auth = await checkInGameCommentAuth(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userid,
      pars.metaGame,
      pars.id,
    );
    if (!auth.ok) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: auth.message }),
        headers,
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to verify permissions for user ${userid} on game ${pars.id}`);
  }

  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get comments for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const commentsData = data.Item;
  console.log("got comments in submitComment:");
  console.log(commentsData);
  let comments: Comment[];
  if (commentsData === undefined)
    comments = []
  else
    comments = commentsData.comments;

  // Check if there were any interesting comments before adding the new one
  const hadInterestingCommentBefore = comments.some(c => isInterestingComment(c.comment));

  if (comments.reduce((s: number, a: Comment) => s + 110 + Buffer.byteLength(a.comment, 'utf8'), 0) < 360000) {
    const comment: Comment = { "comment": pars.comment.substring(0, 4000), "userId": userid, "moveNumber": pars.moveNumber, "timeStamp": Date.now() };
    comments.push(comment);
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMECOMMENTS",
        "sk": pars.id,
        "comments": comments
      }
    }));

    // Check if the new comment is interesting
    const newCommentIsInteresting = isInterestingComment(comment.comment);

    // If we didn't have interesting comments before but the new one is interesting,
    // update the GAME record to set commented = 1
    if (pars.metaGame && !hadInterestingCommentBefore && newCommentIsInteresting) {
      try {
        await ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#0#" + pars.id
          },
          ExpressionAttributeValues: { ":c": 1 },
          UpdateExpression: "set commented = :c",
          ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
        }));
        console.log(`Updated commented flag to 1 for game ${pars.id} (first interesting comment added)`);
      } catch (error) {
        console.log(`Failed to update commented flag for game ${pars.id}:`, error);
        // Don't fail the whole operation just because of the flag update
      }
    }
  }

  // Update lastChat for all players when a comment is added to an in-game chat
  // Note: For completed games, comments go through the exploration system (saveExploration)
  if (pars.players && pars.metaGame) {
    await updateLastChatForPlayers(
      pars.id,
      pars.metaGame,
      pars.players,
      userid,
    );
  }

  if (pars.metaGame) {
    // broadcasting that state has updated
    await wsBroadcast("game", { "meta": pars.metaGame, "id": pars.id }, [userid]);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
}

async function saveExploration(userid: string, pars: { public: boolean, game: string; metaGame: string; move: number; version: number; tree: ExplorationTreeNode | ExplorationTreeNode[]; updateCommentedFlag?: number; gameEnded?: number; updateLastChat?: boolean; players?: { [k: string]: any; id: string; name?: string }[]; }) {
  let treeToSave: ExplorationTreeNode | ExplorationTreeNode[] = pars.tree;
  let gameVariants: string[] | undefined;
  try {
    const gameData = await ddbDocClient.send(new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'GAME',
        sk: pars.metaGame + '#' + (pars.public ? '1' : '0') + '#' + pars.game,
      },
    }));
    if (gameData.Item !== undefined) {
      gameVariants = (gameData.Item as FullGame).variants;
    }
    if (gameData.Item?.state) {
      const game = hydrateGameState(gameData.Item as FullGame);
      treeToSave = filterExplorationTreeForSave(
        pars.metaGame,
        game.state,
        pars.move,
        pars.tree,
        pars.public
      );
    }
  } catch (error) {
    console.warn(`Unable to filter exploration tree for game ${pars.game} move ${pars.move}:`, error);
  }

  // If we need to update the commented flag for a completed game
  if (pars.updateCommentedFlag !== undefined && pars.public && pars.gameEnded !== undefined) {
    try {
      await updateCompletedGameCommentedFlag(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        pars.metaGame,
        pars.game,
        pars.gameEnded,
        pars.updateCommentedFlag,
      );
      console.log(`Updated commented flag for completed game ${pars.game} to ${pars.updateCommentedFlag}`);
    } catch (error) {
      console.log(`Failed to update commented flag for completed game ${pars.game}:`, error);
      // Don't fail the whole operation just because of the flag update
    }
  }

  // Post-game chat: notify opponents via in-app notifications (no completed-dashboard overlay)
  if (pars.updateLastChat && pars.public && pars.players) {
    const chatPlayerIds = pars.players.map(p => p.id);
    const chatSettings = await inAppSettingsMapForUserIds(chatPlayerIds);
    await enqueueCompletedGameChatNotifications(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      pars.game,
      pars.metaGame,
      gameVariants,
      pars.players.map(p => ({ id: p.id, name: p.name ?? 'Someone' })),
      userid,
      { settingsByUserId: chatSettings },
    );
  }

  if (!pars.public) {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMEEXPLORATION#" + pars.game,
        "sk": userid + "#" + pars.move,
        "user": userid,
        "game": pars.game,
        "move": pars.move,
        "tree": JSON.stringify(treeToSave)
      }
    }));
  } else {
    try {
      console.log("Trying to update public exploration at key " + JSON.stringify({ "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` }));
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` },
        ExpressionAttributeValues: { ":v": pars.version, ":inc": 1, ":t": JSON.stringify(treeToSave) },
        ExpressionAttributeNames: { "#v": "version", "#t": "tree" },
        ConditionExpression: "#v = :v",
        UpdateExpression: "set #v = :v + :inc, #t = :t"
      }));
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        // Either nothing here yet, or somebody else has updated the tree. Send back to the front end to merge and try to save again.
        console.log("Failed to update public exploration, trying to get it.")
        const explorationData = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "PUBLICEXPLORATION#" + pars.game,
              "sk": `${pars.move}`
            },
          }));
        let exploration: Exploration | undefined = undefined;
        if (explorationData.Item === undefined) {
          console.log("Nothing here yet, try inserting.");
          // try to insert
          try {
            await ddbDocClient.send(new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "PUBLICEXPLORATION#" + pars.game,
                "sk": `${pars.move}`,
                "version": pars.version + 1,
                "game": pars.game,
                "tree": JSON.stringify(treeToSave)
              },
              ConditionExpression: "attribute_not_exists(sk)"
            }));
          }
          catch (error: any) {
            if (err.name === 'ConditionalCheckFailedException') {
              console.log("Wow, that was unlikely. Failed to insert public exploration, trying to get it.")
              // Somebody else has updated the tree. Send back to the front end to merge and try to save again.
              const explorationData = await ddbDocClient.send(
                new GetCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PUBLICEXPLORATION#" + pars.game,
                    "sk": `${pars.move}`
                  },
                }));
              exploration = explorationData.Item as Exploration;
            } else {
              logGetItemError(err);
              return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
            }
          }
          if (exploration === undefined) {
            console.log("Successfully inserted public exploration, returning to client.");
            return;
          }
        } else {
          exploration = explorationData.Item as Exploration;
        }
        return {
          statusCode: 200,
          body: JSON.stringify(exploration),
          headers
        };
      }
      else {
        logGetItemError(err);
        return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
      }
    }
  }
}

async function getExploration(userid: string, pars: { game: string; move: number }) {
  const work: Promise<any>[] = [];
  let exploration;
  try {
    // get exploration. At pars.move. submitMove now takes care of moving exploration to the current game state.
    exploration = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.game,
          "sk": userid + "#" + pars.move
        },
      })
    );
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get exploration data for game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const trees = [exploration.Item, ,]; // return as an array as was done in the past. Not really needed, but makes transition safer.
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}

// This is for publishing your "during game" exploration for all to see after the game ends.
async function getPrivateExploration(userid: string, pars: { id: string }) {
  let data;
  try {
    data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + pars.id, ":sk": userid + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get exploration data for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const trees = data.Items;
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}

// Mark a game as having had its exploration (for one of the players) published.
async function markAsPublished(userid: string, pars: { id: string; metagame: string }) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metagame + "#1#" + pars.id
        },
      }));
    if (!data.Item)
      throw new Error(`No game ${pars.metagame + "#1#" + pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    const game = data.Item as FullGame;
    if (!game.players.find((p: { id: any; }) => p.id === userid))
      throw new Error(`Only players can publish exploration!`);
    let published: string[] = [];
    if (game.published)
      published = game.published;
    if (published.includes(userid))
      throw new Error(`${userid} has already published for game ${pars.id}`);
    published.push(userid);
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "GAME", "sk": pars.metagame + "#1#" + pars.id },
      ExpressionAttributeValues: { ":p": published },
      UpdateExpression: "set published = :p"
    }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to mark game ${pars.id} as published`);
  }
}



async function handleMove(claims: PartialClaims, pars: { gameid: string; move: string; metaGame: string; }) {
  const botId = claims.sub;
  console.log(`handleMove: Bot ${botId} is making move ${pars.move} in game ${pars.gameid}`);

  if (!pars.metaGame) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "metaGame is required" }),
      headers
    };
  }

  const bot = await getBotRecord(botId);
  if (!bot) {
    return formatReturnError(`Unknown bot ${botId}`);
  }

  const game = await loadGameRecord(pars.metaGame, pars.gameid);
  if (!game) {
    return formatReturnError(`Unable to load game ${pars.gameid}`);
  }

  if (!game.players.some(p => p.id === botId)) {
    return formatReturnError(`Bot ${botId} is not a player in game ${pars.gameid}`);
  }

  const info = gameinfo.get(pars.metaGame);
  const simultaneous = info.flags !== undefined && info.flags.includes('simultaneous');
  const toMoveIds = getToMovePlayerIds(game, simultaneous);
  if (!toMoveIds.includes(botId)) {
    return formatReturnError(`It is not bot ${botId}'s turn in game ${pars.gameid}`);
  }

  return await submitMove(botId, {
    id: pars.gameid,
    move: pars.move,
    metaGame: pars.metaGame,
    cbit: 0,
    draw: "",
  });
}

async function newTournament(userid: string, pars: { metaGame: string, variants: string[] }) {
  const variantErr = validateChallengeVariantUids(pars.metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }
  if (!tournamentPlaySupported(pars.metaGame)) {
    return formatReturnError(`Game ${pars.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
  const variantsKey = pars.variants.sort().join("|");
  const sk = pars.metaGame + "#" + variantsKey;
  let tournamentN = 0;
  let available = true;
  try {
    const tournamentNumber = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENTSCOUNTER",
          "sk": sk
        },
      })
    );
    if (tournamentNumber.Item !== undefined) {
      tournamentN = tournamentNumber.Item.count;
      available = tournamentNumber.Item.over;
      // console.log(`Found tournament ${sk} with count ${tournamentN} and over ${available}`);
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch TOURNAMENTSCOUNTER for '${sk}'`);
  }
  if (!available) {
    return formatReturnError(`There is already a tournament for '${pars.metaGame}#${variantsKey}'`);
  }
  // Try to update counter
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTSCOUNTER", "sk": sk },
      ExpressionAttributeValues: { ":val": tournamentN, ":inc": 1, ":zero": 0, ":f": false },
      ExpressionAttributeNames: { "#count": "count", "#over": "over" },
      ConditionExpression: "attribute_not_exists(#count) OR #count = :val",
      UpdateExpression: "set #count = if_not_exists(#count, :zero) + :inc, #over = :f"
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Failed to update TOURNAMENTSCOUNTER, probably someone else beat us to it. So no harm done.
      console.log(`Failed to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
      return;
    }
    handleCommonErrors(err as { code: any; message: any });
    console.log(err);
    return formatReturnError(`Unable to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  // Insert tournament
  const tournamentid = uuid();
  const data: Tournament = {
    "pk": "TOURNAMENT",
    "sk": tournamentid,
    "id": tournamentid,
    "metaGame": pars.metaGame,
    "variants": pars.variants,
    "number": tournamentN + 1,
    "started": false,
    "dateCreated": Date.now(),
    "datePreviousEnded": 0
  };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    handleCommonErrors(err as { code: any; message: any });
    return formatReturnError(`Unable to insert tournament for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  const ret = await joinTournament(userid, { tournamentid: tournamentid });
  if (ret === undefined) {
    return {
      statusCode: 200,
      body: "New tournament created",
      headers
    };
  } else {
    return ret;
  }
}

async function joinTournament(userid: string, pars: { tournamentid: string, once?: boolean }) {
  let tournament: Tournament;
  let playername = '';
  let once = false;
  if (pars.once !== undefined && pars.once) {
    once = true;
  }
  try {
    const tournamentGet = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    const user = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USERS",
          "sk": userid
        },
      }));
    const [tournamentData, userData] = await Promise.all([tournamentGet, user]);
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
    playername = (userData.Item as User).name;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  if (!tournamentPlaySupported(tournament.metaGame)) {
    return formatReturnError(`Game ${tournament.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
  const sk = `${pars.tournamentid}#1#${userid}`;
  const data: TournamentPlayer = {
    "pk": "TOURNAMENTPLAYER",
    "sk": sk,
    "playername": playername,
    "playerid": userid,
    "once": once,
  };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to add player ${userid} to tournament ${pars.tournamentid}`);
  }
}

async function cancelSignupTournament(tournament: Tournament) {
  console.log(`Deleting tournament ${tournament.id}`);
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "TOURNAMENT",
        "sk": tournament.id
      },
    }));
  const sk = tournament.metaGame + "#" + tournament.variants.sort().join("|");
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTSCOUNTER", "sk": sk },
      ExpressionAttributeValues: { ":t": true },
      ExpressionAttributeNames: { "#o": "over" },
      UpdateExpression: "set #o = :t"
    }));
}

async function withdrawTournament(userid: string, pars: { tournamentid: string }) {
  let tournament: Tournament;
  try {
    const tournamentData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  const sk = `${pars.tournamentid}#1#${userid}`;
  try {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENTPLAYER", "sk": sk
        },
      })
    )
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to withdraw player ${userid} from tournament ${pars.tournamentid}`);
  }
}


async function endATournament(userId: string, pars: { tournamentid: string }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get user ${userId}. Error: ${error}`);
  }
  let tournament: Tournament;
  try {
    const tournamentData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return endTournament(tournament);
}

function tournamentDivisionNumber(player: TournamentPlayer): number | undefined {
  if (player.division !== undefined) {
    return player.division;
  }
  const parts = player.sk.split('#');
  if (parts.length >= 2) {
    const division = Number(parts[1]);
    if (Number.isFinite(division) && division > 0) {
      return division;
    }
  }
  return undefined;
}

function tournamentDivisionWinnerName(
  tournament: Tournament,
  divisionNumber: number | undefined,
): string | undefined {
  if (divisionNumber === undefined || tournament.divisions === undefined) {
    return undefined;
  }
  return tournament.divisions[divisionNumber]?.winner;
}

async function endTournament(tournament: Tournament) {
  try {
    if (tournament.divisions) {
      const work: Promise<any>[] = [];
      let alldone = true;
      let tournamentUpdated = false;
      for (const [divisionNumber, division] of Object.entries(tournament.divisions)) {
        if (division.numCompleted < division.numGames) {
          alldone = false;
        }
        if (division.numCompleted === division.numGames && !division.processed) {
          // Get games
          const work2: Promise<QueryCommandOutput>[] = [];
          work2.push(sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
              ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
            })));
          // And players (we need the ratings at the start of the tournament)
          work2.push(sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            })));
          const [gamesData, playersData] = await Promise.all(work2);
          const gamelist = gamesData.Items as TournamentGame[];
          const players = playersData.Items as TournamentPlayer[];
          const tournamentPlayers: Map<string, TournamentPlayer> = new Map();
          for (let i = 0; i < players.length; i++) {
            players[i].tiebreak = 0;
            players[i].score = 0;
            tournamentPlayers.set(players[i].playerid, players[i]);
          }
          for (const game of gamelist) {
            if (game.winner?.length === 2) {
              tournamentPlayers.get(game.player1)!.score! += 0.5;
              tournamentPlayers.get(game.player2)!.score! += 0.5;
            } else {
              tournamentPlayers.get(game.winner![0])!.score! += 1;
            }
          }
          for (const game of gamelist) {
            if (game.winner?.length === 2) {
              tournamentPlayers.get(game.player1)!.tiebreak! += tournamentPlayers.get(game.player2)!.score! / 2;
              tournamentPlayers.get(game.player2)!.tiebreak! += tournamentPlayers.get(game.player1)!.score! / 2;
            } else if (game.winner![0] === game.player1) {
              tournamentPlayers.get(game.player1)!.tiebreak! += tournamentPlayers.get(game.player2)!.score!;
            } else {
              tournamentPlayers.get(game.player2)!.tiebreak! += tournamentPlayers.get(game.player1)!.score!;
            }
          }
          // Find winner
          let bestScore = 0;
          let bestTiebreak = 0;
          let bestRating = 0;
          let bestPlayer = '';
          let bestPlayerName = '';
          for (const player of players) {
            if (player.score! > bestScore) {
              bestScore = player.score!;
              bestTiebreak = player.tiebreak!;
              bestRating = player.rating!;
              bestPlayer = player.playerid;
              bestPlayerName = player.playername;
            } else if (player.score! === bestScore) {
              if (player.tiebreak! > bestTiebreak) {
                bestTiebreak = player.tiebreak!;
                bestRating = player.rating!;
                bestPlayer = player.playerid;
                bestPlayerName = player.playername;
              } else if (player.tiebreak! === bestTiebreak) {
                if (player.rating! > bestRating) {
                  bestRating = player.rating!;
                  bestPlayer = player.playerid;
                  bestPlayerName = player.playername;
                }
              }
            }
          }
          division.processed = true;
          division.winnerid = bestPlayer;
          division.winner = bestPlayerName;
          // Update tournament players
          for (const player of players) {
            work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.id}#${divisionNumber}#${player.playerid}` },
              ExpressionAttributeNames: { "#t": "tiebreak" },
              ExpressionAttributeValues: { ":t": player.tiebreak },
              UpdateExpression: "set #t = :t"
            })));
            if (player.timeout) {
              work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.nextid}#1#${player.playerid}` },
                ExpressionAttributeNames: { "#t": "timeout" },
                ExpressionAttributeValues: { ":t": true },
                UpdateExpression: "set #t = :t",
                ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
              })).catch(error => {
                if (error.name === 'ConditionalCheckFailedException') {
                  console.log(`Player ${player.playerid} already left the next tournament, so no need to record timeout.`);
                } else {
                  throw error;
                }
              }));
            }
          }
          tournamentUpdated = true;
        }
      }
      if (tournamentUpdated) {
        // Update tournament
        if (!alldone) {
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions },
            UpdateExpression: "set divisions = :ds",
          })));
        } else {
          const now = Date.now();
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions, ":dt": now },
            UpdateExpression: "set divisions = :ds, dateEnded = :dt",
          })));
          // Start the clock for next tournament start
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.nextid },
            ExpressionAttributeValues: { ":dt": now },
            UpdateExpression: "set datePreviousEnded = :dt",
          })));
          // Send e-mails to participants
          // Now we need ALL players, not just the ones in the current division
          const playersData = await sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            }));
          const players = playersData.Items as TournamentPlayer[];
          const playersById = new Map(players.map(p => [p.playerid, p]));
          // And, in fact, full players (just for e-mail!? and language... Don't want to put these in the tournament player because then those will have to be maintained if e-mail or language changes)
          const playersFull = await getPlayers(players.map(p => p.playerid));
          await initi18n('en');
          const tableName = process.env.ABSTRACT_PLAY_TABLE!;
          for (const player of playersFull) {
            const tournamentPlayer = playersById.get(player.id);
            const divisionNumber = tournamentPlayer
              ? tournamentDivisionNumber(tournamentPlayer)
              : undefined;
            const winnerName = tournamentDivisionWinnerName(tournament, divisionNumber);
            work.push(createNotification(ddbDocClient, tableName, player.id, {
              type: 'tournamentEnd',
              tournamentId: tournament.id,
              metaGame: tournament.metaGame,
              number: tournament.number,
              variants: tournament.variants ?? [],
              ...(winnerName ? { winnerName } : {}),
            }, {
              userSettings: player.settings,
            }));
            console.log(`Determining whether to send tournamentEnd email to the following player:\n${JSON.stringify(player)}`);
            // eslint-disable-next-line no-prototype-builtins
            if ((player.settings?.all?.notifications === undefined) || (!player.settings.all.notifications.hasOwnProperty("tournamentEnd")) || (player.settings.all.notifications.tournamentEnd)) {
              console.log("Sending email");
              await changeLanguageForPlayer(player);
              const metaGameName = localizedGameName(tournament.metaGame);
              let body = '';
              if (tournament.variants.length === 0)
                body = i18n.t("TournamentEndBody", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id });
              else
                body = i18n.t("TournamentEndBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id, "variants": tournament.variants.join(", ") });
              if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentEndSubject", { "metaGame": metaGameName, }), body);
                work.push(sesClient.send(comm));
              }
              work.push(sendPush({
                userId: player.id,
                topic: "tournament",
                title: i18n.t("PUSH.titles.tournamentOver"),
                body,
                url: `/tournament/${tournament.id}`,
              }));
            }
          }
        }
      }
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Error during update tournament ${tournament.id}: {error}`);
  }
  return {
    statusCode: 200,
    body: "Done",
    headers
  };
}

// ORGANIZED EVENTS

async function eventCreate(userid: string, pars: { name: string, date: number, description: string, maxPlayers: number }) {
  // authorize first
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const eventid = uuid();
    const eventRec: OrgEvent = {
      pk: "ORGEVENT",
      sk: eventid,
      name: pars.name,
      description: pars.description,
      organizer: userid,
      dateStart: pars.date,
      visible: false,
      invited: [],
      blocked: [],
      maxPlayers: pars.maxPlayers,
    };
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ eventid }),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to create event. Error: ${error}`);
  }
}

async function eventPublish(userid: string, pars: { eventid: string }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    // must be in the future and have nonempty description
    if (eventRec.dateStart <= Date.now() || /^\s*$/.test(eventRec.description)) {
      return {
        statusCode: 400,
        body: "The start date must be in the future and the description may not be empty.",
        headers,
      };
    }
    eventRec.visible = true;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to publish event ${pars.eventid}. Error: ${error}`);
  }
}

async function eventDelete(userid: string, pars: { eventid: string }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    // get associated players and games
    const players = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));
    const games = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));

    // the event must not be over and there must not be any associated games
    if (eventRec.dateEnd !== undefined || (games.Items !== undefined && games.Items.length > 0)) {
      return {
        statusCode: 400,
        body: "You cannot delete events that are over or that have associated games.",
        headers,
      };
    }

    // delete associated player records
    if (players.Items !== undefined && players.Items.length > 0) {
      for (const { playerid } of players.Items as OrgEventPlayer[]) {
        await ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "ORGEVENTPLAYER",
              "sk": `${pars.eventid}#${playerid}`
            },
          })
        );
      }
    }

    // now delete the event itself
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid,
        },
      })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to delete event ${pars.eventid}. Error: ${error}`);
  }
}

async function eventRegister(userid: string, pars: { eventid: string }) {
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    // must be open for registration
    if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== undefined) {
      return {
        statusCode: 400,
        body: "You may only register for events that are open for registration.",
        headers,
      };
    }
    if (eventRec.blocked !== undefined && eventRec.blocked.includes(userid)) {
      return {
        statusCode: 400,
        body: "You are blocked from registering for this event.",
        headers,
      };
    }
    if (eventRec.invited !== undefined && eventRec.invited.length > 0 && !eventRec.invited.includes(userid)) {
      return {
        statusCode: 400,
        body: "This event is by invitation only.",
        headers,
      };
    }
    if (eventRec.maxPlayers > 0) {
      const players = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          Select: "COUNT"
        }));
      if (players.Count !== undefined && players.Count >= eventRec.maxPlayers) {
        return {
          statusCode: 400,
          body: "This event is full.",
          headers,
        };
      }
    }
    const newRec: OrgEventPlayer = {
      pk: "ORGEVENTPLAYER",
      sk: `${pars.eventid}#${userid}`,
      playerid: userid,
    }
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: newRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(newRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to register for event ${pars.eventid}. Error: ${error}`);
  }
}

async function eventWithdraw(userid: string, pars: { eventid: string }) {
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    // must be open for registration
    if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== undefined) {
      return {
        statusCode: 400,
        body: "You may only withdraw from events that are open for registration.",
        headers,
      };
    }
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENTPLAYER",
          "sk": `${pars.eventid}#${userid}`
        },
      })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to withdraw from event ${pars.eventid}. Error: ${error}`);
  }
}

async function eventUpdateStart(userid: string, pars: { eventid: string, newDate: number }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.dateStart = pars.newDate;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update event start date. Error: ${error}`);
  }
}

async function eventUpdateName(userid: string, pars: { eventid: string, name: string }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.name = pars.name;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update event start date. Error: ${error}`);
  }
}

async function eventUpdateDesc(userid: string, pars: { eventid: string, description: string }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    eventRec.description = pars.description;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update event start date. Error: ${error}`);
  }
}

async function eventUpdateInvites(userid: string, pars: { eventid: string, invited: string[], blocked: string[] }) {
  // authorize first
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventUpdateInvites: Unable to load user record to authorize ${userid}`);
  }
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }
    const eventRec = event.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
      return {
        statusCode: 401,
        headers
      };
    }
    const previousInvited = new Set(eventRec.invited ?? []);
    const invited = Array.isArray(pars.invited) ? pars.invited : [];
    const blocked = Array.isArray(pars.blocked) ? pars.blocked : [];
    eventRec.invited = invited;
    eventRec.blocked = blocked;
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: eventRec,
      })
    );
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const newlyInvited = invited.filter(id => !previousInvited.has(id));
    const toNotify = await resolveEventInvitationNotifyIds(
      ddbDocClient,
      tableName,
      invited,
      newlyInvited,
      pars.eventid,
    );
    const inviteeSettings = await inAppSettingsMapForUserIds(toNotify);
    await enqueueEventInvitationNotifications(
      ddbDocClient,
      tableName,
      toNotify,
      {
        eventId: pars.eventid,
        eventName: eventRec.name,
        organizerId: userid,
        organizerName: userRec!.name,
      },
      inviteeSettings,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(eventRec),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update event invites. Error: ${error}`);
  }
}

type PairingPlayer = {
  id: string;
  name: string;
  country: string;
  stars: string[];
  lastSeen: number;
};
type Pairing = {
  round: number;
  metagame: string;
  variants: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  p1: PairingPlayer;
  p2: PairingPlayer
};

async function eventUpdateResult(userid: string, pars: { eventid: string, gameid: string, result: string[] }) {
  // load event and authorize requester
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event: OrgEvent;
  try {
    const eventRec = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (eventRec.Item === undefined) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers,
      };
    }
    event = eventRec.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
  }
  // update game record
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
      ExpressionAttributeValues: { ":win": pars.result, ":arb": true },
      UpdateExpression: "set winner = :win, arbitrated = :arb",
    }));
    return {
      statusCode: 200,
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventUpdateResult: Unable to set result ${pars.result} for ${pars.eventid}#${pars.gameid}`);
  }
}

type DivisionTable = string[][];
async function eventUpdateDivisions(userid: string, pars: { eventid: string; divisions: DivisionTable }) {
  // (Do as much validation as possible before creating games and abort if anything's wrong.)
  console.log(`About to try updating division assignments for event ${pars.eventid}:\n${JSON.stringify(pars.divisions, null, 2)}`);
  // load event and authorize requester
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event: OrgEvent;
  try {
    const eventRec = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (eventRec.Item === undefined) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers,
      };
    }
    event = eventRec.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
  }
  // get list of registered players
  let eventPlayers: OrgEventPlayer[];
  try {
    const pRecs = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));
    if (pRecs.Items === undefined || pRecs.Items.length === 0) {
      console.log(`Error 400: No players`);
      return {
        statusCode: 400,
        body: "This event has no registered players!",
        headers
      };
    }
    eventPlayers = pRecs.Items as OrgEventPlayer[];
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error}`);
  }

  // ensure there are at least 2 divisions
  if (pars.divisions.length < 2) {
    console.log(`Error 400: Too few divisions`);
    return {
      statusCode: 400,
      body: `There must be at least two divisions.`,
      headers
    };
  }

  // ensure that each division has at least 2 players assigned
  if (Math.min(...pars.divisions.map(d => d.length)) < 2) {
    console.log(`Error 400: Too-small division`);
    return {
      statusCode: 400,
      body: `Each division must have at least two players assigned.`,
      headers
    };
  }

  // ensure that all assigned players are registered or abort
  const idsRegistered = eventPlayers.map(p => p.playerid);
  for (const uid of pars.divisions.flat()) {
    if (!idsRegistered.includes(uid)) {
      console.log(`Error 400: Unregistered player`);
      return {
        statusCode: 400,
        body: `You may not assign divisions to players not registered for this event.`,
        headers
      };
    }
  }

  // ensure that all participating players have been assigned or abort
  const setRegistrants = new Set<string>(idsRegistered);
  for (const uid of pars.divisions.flat()) {
    setRegistrants.delete(uid);
  }
  if (setRegistrants.size > 0) {
    console.log(`Error 400: Not all players assigned`);
    return {
      statusCode: 400,
      body: `All registered players must be assigned to a division.`,
      headers
    };
  }

  // ensure there are no duplicates anywhere
  const seen = new Set<string>(pars.divisions.flat());
  if (seen.size < pars.divisions.flat().length) {
    console.log(`Error 400: Duplicates`);
    return {
      statusCode: 400,
      body: `Players must only be assigned to one division. No duplicates allowed.`,
      headers
    };
  }

  const list: Promise<any>[] = [];
  try {
    // for each division
    for (let d = 0; d < pars.divisions.length; d++) {
      const division = pars.divisions[d];
      for (const pid of division) {
        const cmd = ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "ORGEVENTPLAYER", "sk": `${pars.eventid}#${pid}` },
          ExpressionAttributeValues: { ":div": d + 1 },
          UpdateExpression: "set division = :div",
        }));
        list.push(cmd);
      }
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventUpdateDivisions: Something went wrong assigning divisions for event ${pars.eventid}. Error: ${error}`);
  }
  // execute all updates
  try {
    await Promise.all(list);
    return {
      statusCode: 200,
      headers
    };
  } catch (error) {
    logGetItemError(error);
    throw new Error(`Something terrible happened while trying to assign divisions for event ${pars.eventid}`);
  }
}

async function eventCreateGames(userid: string, pars: { eventid: string; pairs: Pairing[] }) {
  // (Do as much validation as possible before creating games and abort if anything's wrong.)
  console.log(`About to try creating the following pairings for event ${pars.eventid}:\n${JSON.stringify(pars.pairs, null, 2)}`);
  // load event and authorize requester
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
  }
  let event: OrgEvent;
  try {
    const eventRec = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (eventRec.Item === undefined) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers,
      };
    }
    event = eventRec.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
  }
  // get list of registered players
  let eventPlayers: OrgEventPlayer[];
  try {
    const pRecs = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));
    if (pRecs.Items === undefined || pRecs.Items.length === 0) {
      console.log(`Error 400: No players`);
      return {
        statusCode: 400,
        body: "This event has no registered players!",
        headers
      };
    }
    eventPlayers = pRecs.Items as OrgEventPlayer[];
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error}`);
  }
  // ensure that all paired players are registered or abort
  const idsRegistered = eventPlayers.map(p => p.playerid);
  for (const pair of pars.pairs) {
    if (!idsRegistered.includes(pair.p1.id) || !idsRegistered.includes(pair.p2.id)) {
      console.log(`Error 400: Unregistered player`);
      return {
        statusCode: 400,
        body: `You may not create games for players not registered for this event.`,
        headers
      };
    }
  }
  // load all player records to be paired
  const idsPaired = new Set<string>();
  for (const pair of pars.pairs) {
    idsPaired.add(pair.p1.id);
    idsPaired.add(pair.p2.id);
  }
  let players: FullUser[];
  try {
    players = await getPlayers([...idsPaired.values()]);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to load full player records for registered players for event ${pars.eventid}. Error: ${error}`);
  }
  // try to initialize all requested metagame/variant combos to make sure they're valid
  try {
    const tried = new Set<string>();
    for (const pair of pars.pairs) {
      const id = [pair.metagame, ...pair.variants].join("|");
      if (tried.has(id)) {
        continue;
      } else {
        tried.add(id);
      }
      const info = gameinfo.get(pair.metagame);
      let engine;
      if (info.playercounts.length > 1)
        engine = GameFactory(pair.metagame, 2, pair.variants);
      else
        engine = GameFactory(pair.metagame, undefined, pair.variants);
      if (!engine) {
        console.log(`Error 400: No engine`);
        return {
          statusCode: 400,
          body: `The game engine could not be initialized for the game ${pair.metagame} and the variants "${pair.variants.join(", ")}".`,
          headers
        };
      }
      const varsReqd = [...pair.variants];
      varsReqd.sort((a, b) => a.localeCompare(b));
      const varsEngine = [...engine.variants];
      varsEngine.sort((a, b) => a.localeCompare(b));
      if (varsReqd.join("|") !== varsEngine.join("|")) {
        console.log(`Error 400: Missing variants`);
        return {
          statusCode: 400,
          body: `The variants requested (${JSON.stringify(varsReqd)}) do not match the variants asserted by the game engine (${JSON.stringify(varsEngine)}).`,
          headers
        };
      }
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Unable to validate metagame/variant combos for event ${pars.eventid}. Error: ${error}`);
  }

  const list: Promise<any>[] = [];
  const createdGames: NotificationGame[] = [];
  try {
    for (const pair of pars.pairs) {
      // create game record
      const gameId = uuid();
      const playerIDs = [pair.p1.id, pair.p2.id];
      let whoseTurn: string | boolean[] = "0";
      const info = gameinfo.get(pair.metagame);
      if (info.flags !== undefined && info.flags.includes('simultaneous')) {
        whoseTurn = playerIDs.map(() => true);
      }
      let engine: GameBase | GameBaseSimultaneous;
      if (info.playercounts.length > 1) {
        engine = GameFactory(pair.metagame, 2, pair.variants)!;
      } else {
        engine = GameFactory(pair.metagame, undefined, pair.variants)!;
      }
      const state = engine.serialize();
      const now = Date.now();
      const pInvolved = [players.find(p => p.id === pair.p1.id)!, players.find(p => p.id === pair.p2.id)!];
      // @ts-ignore
      if (pInvolved.includes(undefined)) {
        throw new Error("Could not find one of the players! This should never happen!");
      }
      const gamePlayers = pInvolved.map(p => { return { "id": p.id, "name": p.name, "time": pair.clockStart * 3600000 } }) as User[];
      applyPerspectivePlayerRotations(
        gamePlayers as Array<{ settings?: { rotate?: number } }>,
        playerIDs.length,
        effectiveFlags(engine, pair.metagame, pair.variants),
      );
      // queue for update
      const addGame = sendCommandWithRetry(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage({
          "pk": "GAME",
          "sk": pair.metagame + "#0#" + gameId,
          "id": gameId,
          "metaGame": pair.metagame,
          "numPlayers": 2,
          "rated": true,
          "players": gamePlayers,
          "clockStart": pair.clockStart,
          "clockInc": pair.clockInc,
          "clockMax": pair.clockMax,
          "clockHard": true,
          "noExplore": false,
          "state": state,
          "toMove": whoseTurn,
          "lastMoveTime": now,
          "gameStarted": now,
          "variants": engine.variants,
          "event": pars.eventid,
        } as FullGame)
      }));
      list.push(addGame);
      const eventGame: OrgEventGame = {
        pk: "ORGEVENTGAME",
        sk: [pars.eventid, gameId].join("#"),
        metaGame: pair.metagame,
        variants: engine.variants,
        round: pair.round,
        gameid: gameId,
        player1: pair.p1.id,
        player2: pair.p2.id,
      };
      list.push(
        sendCommandWithRetry(new PutCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: eventGame,
        }))
      );
      createdGames.push({
        id: gameId,
        metaGame: pair.metagame,
        variants: engine.variants,
        players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
      });
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventCreateGames: Something went wrong generating pairings for event ${pars.eventid}. Error: ${error}`);
  }
  // execute all updates
  try {
    await Promise.all(list);
    const createdGameSettings = await inAppSettingsMapForUserIds(
      createdGames.flatMap(game => game.players.map(p => p.id)),
    );
    await Promise.all(createdGames.map(game => enqueueGameStartNotifications(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      game,
      createdGameSettings,
    )));
    return {
      statusCode: 200,
      headers
    };
  } catch (error) {
    logGetItemError(error);
    throw new Error(`Something terrible happened while trying to create paired games for event ${pars.eventid}`);
  }
}

async function eventClose(userid: string, pars: { eventid: string, winner: string[] }) {
  // load event and authorize requester
  let userRec: FullUser | undefined;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
    userRec = user.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventClose: Unable to load user record to authorize ${userid}`);
  }
  let event: OrgEvent;
  try {
    const eventRec = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (eventRec.Item === undefined) {
      console.log(`Error 404`);
      return {
        statusCode: 404,
        headers,
      };
    }
    event = eventRec.Item as OrgEvent;
    if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
      console.log(`Error 401`);
      return {
        statusCode: 401,
        headers
      };
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`eventClose: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
  }
  // update event record
  try {
    if (event.dateEnd === undefined) {
      event.dateEnd = Date.now();
    }
    event.winner = pars.winner;
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: event
    })
    );
    return {
      statusCode: 200,
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`eventClose: Unable to close event ${pars.eventid}`);
  }
}

async function eventUpdates(pars: { eventid: string, gameid: string, winner: string[] }): Promise<any[]> {
  const work: Promise<any>[] = [];
  work.push(
    sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
      ExpressionAttributeValues: { ":win": pars.winner, ":arb": false },
      UpdateExpression: "set winner = :win, arbitrated = :arb",
    }))
  );
  return Promise.all(work);
}

// Delete every trace of a list of games. Admin only — dev/prod repair hammer.
async function deleteGames(userId: string, pars: { metaGame: string, cbit: number, gameids: string }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get user ${userId}. Error: ${error}`);
  }

  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError('cbit must be 0 or 1');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const preferredCbit = pars.cbit as 0 | 1;
  const gameids = pars.gameids.split(",").map(id => id.trim()).filter(id => id.length > 0);
  const results: Awaited<ReturnType<typeof adminDeleteGame>>[] = [];

  try {
    for (const gameid of gameids) {
      results.push(await adminDeleteGame(
        ddbDocClient,
        tableName,
        pars.metaGame,
        gameid,
        preferredCbit,
      ));
    }

    const notFound = results.filter(result => result.notFound).map(result => result.gameId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: notFound.length > 0
          ? `Deleted ${results.length - notFound.length} game(s); not found: ${notFound.join(', ')}`
          : `Deleted ${results.length} game(s)`,
        results,
      }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to delete games ${pars.gameids}. Error: ${error}`);
  }
}




async function invokePie(userid: string, pars: { id: string, metaGame: string, cbit: number }) {
  if (pars.cbit !== 0) {
    return formatReturnError("cbit must be 0");
  }
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
    const game = hydrateGameState(data.Item as FullGame);
    console.log("got game in invokePie:");
    console.log(game);
    if (("pieInvoked" in game) && (game.pieInvoked === true)) {
      console.log("Double pie detected! Aborting!");
      return {
        statusCode: 200,
        body: JSON.stringify(game),
        headers
      };
    } else {
      const engine = GameFactory(game.metaGame, game.state);
      if (!engine)
        throw new Error(`Unknown metaGame ${game.metaGame}`);
      const flags = effectiveFlags(engine, game.metaGame, game.variants);
      if (!flagSetIncludes(flags, "pie") && !flagSetIncludes(flags, "pie-even")) {
        throw new Error(`Metagame ${pars.metaGame} does not have the "pie" flag. Aborting.`);
      }
      const lastMoveTime = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();

      const player = game.players.find(p => p.id === userid);
      if (!player)
        throw new Error(`Player ${userid} isn't playing in game ${pars.id}`)

      const timestamp = Date.now();
      const timeUsed = timestamp - lastMoveTime;
      // console.log("timeUsed", timeUsed);
      // console.log("player", player);
      if (player.time! - timeUsed < 0)
        player.time = game.clockInc * 3600000; // If the opponent didn't claim a timeout win, and player moved, pretend his remaining time was zero.
      else
        player.time = player.time! - timeUsed + game.clockInc * 3600000;
      if (player.time > game.clockMax * 3600000) player.time = game.clockMax * 3600000;
      const playerIDs = game.players.map((p: { id: any; }) => p.id);
      // TODO: We are updating players and their games. This should be put in some kind of critical section!
      const players = await getPlayers(playerIDs);
      console.log(`Current player list: ${JSON.stringify(game.players)}`);
      const reversed = [...game.players].reverse();
      console.log(`Reversed: ${JSON.stringify(reversed)}`);
      game.players = [...reversed];
      game.pieInvoked = true;

      // if flag is `pie-even`, issue a "pass" command
      if (flagSetIncludes(flags, "pie-even")) {
        try {
          engine.move("pass")
          game.state = engine.serialize();
          game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
          game.toMove = `${engine.currplayer! - 1}`;
        } catch (err) {
          logGetItemError(err);
          return formatReturnError('Error passing while invoking "pie-even"');
        }
      } else {
        // the other player needs to be given `timeUsed` back on their clock to account
        // for the fact that the game state is not changing (`lastMoveTime` isn't going
        // to change)
        const otherPlayer = game.players.find(p => p.id !== userid)!;
        otherPlayer.time = otherPlayer.time! + timeUsed;
        game.numMoves = engine.state().stack.length - 1;
      }

      // this should be all the info we want to show on the "my games" summary page.
      const playerGame = {
        "id": game.id,
        "metaGame": game.metaGame,
        // reverse the list of players
        "players": [...reversed],
        "clockHard": game.clockHard,
        "noExplore": game.noExplore || false,
        "toMove": game.toMove,
        "lastMoveTime": timestamp
      } as Game;
      const list: Promise<any>[] = [];
      game.lastMoveTime = timestamp;
      const updateGame = ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage(game)
      }));
      list.push(updateGame);
      console.log("Scheduled update to game");

      list.push(updateWatcherSummaries(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        game.id,
        playerGame as GameMarkSummary,
      ));

      // insert a comment into the game log
      const thisPlayer = players.find(p => p.id === userid)!;
      list.push(submitComment("", { id: game.id, metaGame: pars.metaGame, comment: `${thisPlayer.name} elected to switch seats. As a result, the game record for ply 1 has been retroactively changed to look as if ${thisPlayer.name} made that move.`, moveNumber: 2 }));

      list.push(sendSubmittedMoveEmails(game, players.filter(p => p.email) as FullUser[], false));
      console.log("Scheduled emails");
      await Promise.all(list);
      console.log("All updates complete");
      await realPingBot(pars.metaGame, pars.id, game);
      return {
        statusCode: 200,
        body: JSON.stringify(game),
        headers
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to process invoke pie');
  }
}

async function updateNote(userId: string, pars: { gameId: string; note?: string; }) {
  // if note is empty, delete the record
  if ((pars.note === undefined) || (pars.note === null) || (pars.note.length === 0)) {
    try {
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "NOTE", "sk": `${pars.gameId}#${userId}`,
          },
        })
      )
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote (delete, actually) ${userId}`);
    }
    // otherwise, just PUT it!
  } else {
    const note: Note = {
      pk: "NOTE",
      sk: `${pars.gameId}#${userId}`,
      note: pars.note,
    }
    console.log(`Setting note for user ${userId}, game ${pars.gameId}.`);
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: note
      }));
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote ${userId}`);
    }
  }
  return {
    statusCode: 200,
    body: "",
    headers
  };
}

// updateCommented has no participant/admin gate today; client side effects of commented-flag updates are not fully understood.
async function updateCommented(userId: string, pars: { id: string; metaGame: string; cbit: number; commented: number; gameEnded?: number; }) {
  console.log(`Updating commented flag for game ${pars.id} to ${pars.commented}, cbit=${pars.cbit}, gameEnded=${pars.gameEnded}`);
  try {
    if (pars.cbit === 1 && pars.gameEnded !== undefined) {
      await updateCompletedGameCommentedFlag(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        pars.metaGame,
        pars.id,
        pars.gameEnded,
        pars.commented,
      );
      console.log(`Successfully updated commented flag in COMPLETEDGAMES for game ${pars.id} to ${pars.commented}`);
    } else if (pars.cbit === 0) {
      // For current games, update GAME table
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
        ExpressionAttributeValues: { ":c": pars.commented },
        UpdateExpression: "set commented = :c",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
      }));
      console.log(`Successfully updated commented flag in GAME for game ${pars.id} to ${pars.commented}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update commented flag for game ${pars.id}: ${err}`);
  }
}

async function setLastSeen(userId: string, pars: { gameId: string; interval?: number; }) {
  // get USER rec
  let user: FullUser | undefined;
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (data.Item !== undefined) {
      user = data.Item as FullUser;
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to setLastSeen ${userId}`);
  }
  if (user !== undefined) {
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const onCurrent = await hasCurrentGameRow(ddbDocClient, tableName, userId, pars.gameId);
    if (onCurrent) {
      // set lastSeen to "now" + interval
      let interval = 8;
      if (pars.interval !== undefined) {
        interval = pars.interval;
      }
      const now = new Date();
      const then = new Date();
      then.setDate(now.getDate() - interval);
      console.log(`Setting lastSeen for ${pars.gameId} to ${then.getTime()} (${then.toUTCString()}). It is currently ${new Date().toUTCString()}`);
      await upsertUserGameOverlay(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        userId,
        pars.gameId,
        { seen: then.getTime(), lastChat: then.getTime() },
      );
      return {
        statusCode: 200,
        body: "",
        headers
      };
    }
  }
  let interval = 8;
  if (pars.interval !== undefined) {
    interval = pars.interval;
  }
  const now = new Date();
  const then = new Date();
  then.setDate(now.getDate() - interval);
  const watchedUpdated = await setWatchedSeen(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    userId,
    pars.gameId,
    then.getTime(),
    then.getTime(),
  );
  if (watchedUpdated) {
    return {
      statusCode: 200,
      body: "",
      headers
    };
  }
  return {
    statusCode: 406,
    body: "",
    headers
  };
}

async function botManageChallenges() {
  const userId = process.env.AIAI_USERID;
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (userData.Item === undefined) {
      throw new Error("Could not find a USER record for the AiAi bot");
    }
    const user = userData.Item as FullUser;
    const games = await loadDashboardGames(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId!,
    );

    console.log(`Fetching challenges`);
    const challengesReceivedIDs: string[] = Array.from(user?.challenges_received ?? new Set());
    const data = await getChallenges(challengesReceivedIDs);
    const challengesReceived = data.map(r => r.Item as FullChallenge);
    console.log(`Got the following challenges:\n${JSON.stringify(challengesReceived, null, 2)}`);

    // process each challenge and accept/reject as appropriate
    for (const challenge of challengesReceived) {
      let accepted = false;
      // the overall meta must be supported
      const info = gameinfo.get(challenge.metaGame);
      if (info?.flags.includes("aiai")) {
        accepted = true;
      }
      // add any variant exceptions here too
      if (challenge.metaGame === "tumbleweed") {
        if (challenge.variants.includes("free-neutral") || challenge.variants.includes("capture-delay")) {
          accepted = false;
        }
      }

      // accept/reject challenge
      console.log(`About to ${accepted ? "accept" : "deny"} challenge ${challenge.sk}`)
      await respondedChallenge(process.env.AIAI_USERID!, { response: accepted, id: challenge.sk!, standing: challenge.standing, metaGame: challenge.metaGame, comment: "Let's play!" });
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to manage bot challenges: ${err}`);
  }

  // now get list of games where it's your turn and make moves
  // have to refetch, sadly!
  // but check for bot's turn early to avoid unnecessary refetches
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (userData.Item === undefined) {
      throw new Error("Could not find a USER record for the AiAi bot");
    }
    const user = userData.Item as FullUser;
    const games = await loadDashboardGames(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId!,
    );

    for (const game of games) {
      const info = gameinfo.get(game.metaGame);
      if (game.toMove !== null && game.toMove !== "") {
        const ids: string[] = [];
        if (info.flags.includes("simultaneous")) {
          const toMove = game.toMove as boolean[];
          if (toMove) {
            for (let i = 0; i < toMove.length; i++) {
              if (toMove[i]) {
                ids.push(game.players[i].id);
              }
            }
          }
        } else {
          ids.push(game.players[parseInt(game.toMove as string, 10)].id);
        }
        if (ids.includes(process.env.AIAI_USERID!)) {
          await realPingBot(game.metaGame, game.id);
        }
      }
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to manage bot challenges: ${err}`);
  }
}

async function onetimeFix(userId: string) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to onetimeFix ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'onetime_fix is retired. It previously synced USER profile fields into the USERS directory index.',
      useInstead: 'No replacement — run a targeted script or one-off repair if USERS directory fields are stale.',
    }),
    headers
  };
}

async function fixGames(userId: string, pars: { targetId: string }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fix_games ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'fix_games no longer rebuilds USER.games[]. Dashboard membership is index-only (CURRENTGAMES#, USERGAME#).',
      useInstead: [
        'Verify: node bin/verify-dashboard-index.mjs --stage prod --verbose <userId>',
        'Purge USERGAME# orphans: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-usergame-orphans --user-id <userId>',
        'If legacy RECENTCOMPLETED# rows reappear: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-all-recent-completed',
      ],
      targetId: pars.targetId,
    }),
    headers
  };
}

async function testAsync(userId: string, pars: { N: number; }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    console.log(`Calling makeWork with ${pars.N}`);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    makeWork();
    console.log('Done calling makeWork');
    return {
      statusCode: 200,
      body: JSON.stringify({ "n": pars.N }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to test_async ${userId}`);
  }
}

function makeWork() {
  return new Promise(function (resolve) {
    console.log("In makeWork");
    setTimeout(() => {
      console.log("End makeWork");
      resolve('resolved');
    }, 3000);
  });
}


function shuffle(array: any[]) {
  let i = array.length, j;

  while (i > 1) {
    j = Math.floor(Math.random() * i);
    i--;
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

async function* queryItemsGenerator(queryInput: QueryCommandInput): AsyncGenerator<unknown> {
  let lastEvaluatedKey: Record<string, any> | undefined
  do {
    const { Items, LastEvaluatedKey } = await ddbDocClient
      .send(new QueryCommand({ ...queryInput, ExclusiveStartKey: lastEvaluatedKey }));
    lastEvaluatedKey = LastEvaluatedKey
    if (Items !== undefined) {
      yield Items
    }
  } while (lastEvaluatedKey !== undefined)
}

async function purgeRetiredCompletedGames(userId: string) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to purge retired completed games ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'purge_retired_completed_games is retired. One-time purge complete (no retired COMPLETEDGAMES pk shapes remain).',
      useInstead: [],
    }),
    headers
  };
}

async function updateMetaGameCounts(userId: string) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }

    const metaGames: string[] = [];
    gameinfo.forEach((game) => metaGames.push(game.uid));
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const currentgames = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const completedgames = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const standingchallenges = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    let playerCountsByUid: Record<string, number> = {};
    try {
      playerCountsByUid = await loadSummaryPlayerCountsByUid();
    } catch (err) {
      console.warn('updateMetaGameCounts: batch ratings counts unavailable', err);
    }

    const work = await Promise.all([
      Promise.all(currentgames),
      Promise.all(completedgames),
      Promise.all(standingchallenges),
    ]);
    console.log("updateMetaGameCounts recount complete");

    // process stars
    const players = await getAllUsers();
    console.log("All players");
    console.log(JSON.stringify(players.map(p => p.name)));
    const starCounts = new Map<string, number>();
    for (const p of players) {
      if (p.stars !== undefined) {
        for (const star of p.stars) {
          if (starCounts.has(star)) {
            const val = starCounts.get(star)!;
            starCounts.set(star, val + 1);
          } else {
            starCounts.set(star, 1);
          }
        }
      }
    }

    const shardedCounts: Record<string, {
      currentgames: number;
      completedgames: number;
      standingchallenges: number;
      stars: number;
      ratingsCount: number;
    }> = {};
    metaGames.forEach((game, ind) => {
      shardedCounts[game] = {
        currentgames: work[0][ind].Items ? work[0][ind].Items!.length : 0,
        completedgames: work[1][ind].Items ? work[1][ind].Items!.length : 0,
        standingchallenges: work[2][ind].Items ? work[2][ind].Items!.length : 0,
        stars: starCounts.has(game) ? starCounts.get(game)! : 0,
        ratingsCount: playerCountsByUid[game] ?? 0,
      };
    });

    console.log(shardedCounts);
    await Promise.all(metaGames.map(metaGame =>
      ddbDocClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `METAGAMES#${metaGame}`,
          sk: 'COUNTS',
          ...shardedCounts[metaGame],
        },
      }))
    ));

    return {
      statusCode: 200,
      body: JSON.stringify({ metaGames: metaGames.length }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}

// Make sure to increase the lamda timeout (from 6s) when you want to process all users. Just getting all users already takes about 2s.
const getAllUsers = async (): Promise<FullUser[]> => {
  const result: FullUser[] = []
  const queryInput: QueryCommandInput = {
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: {
      '#pk': 'pk',
    },
    ExpressionAttributeValues: {
      ':pk': 'USER',
    },
    TableName: process.env.ABSTRACT_PLAY_TABLE,
  }
  for await (const page of queryItemsGenerator(queryInput)) {
    result.push(...page as FullUser[]);
  }
  return result
}

/** Route dispatch — thin auth glue re-exported from lib (Phase 5). */
export {
  botMove,
  checkForAbandonedGame,
  timeloss,
  checkForTimeloss,
  deleteGames,
  endATournament,
  eventClose,
  eventCreate,
  eventCreateGames,
  eventDelete,
  eventPublish,
  eventRegister,
  eventUpdateDesc,
  eventUpdateDivisions,
  eventUpdateInvites,
  eventUpdateName,
  eventUpdateResult,
  eventUpdateStart,
  eventWithdraw,
  fixGames,
  game,
  getExploration,
  getPrivateExploration,
  handleMove,
  injectState,
  invokePie,
  joinTournament,
  markAsPublished,
  newChallenge,
  newTournament,
  onetimeFix,
  purgeRetiredCompletedGames,
  respondedChallenge,
  revokeChallenge,
  saveExploration,
  setLastSeen,
  startSoloGame,
  submitComment,
  submitMove,
  testAsync,
  toggleStar,
  updateCommented,
  updateGameSettings,
  updateMetaGameCounts,
  updateNote,
  updateUserSettings,
  withdrawTournament,
};

export {
  beginBotSecretRotation,
  createBot,
  deleteBot,
  finalizeBotSecretRotation,
  updateBot,
} from '../lib/bots/crud.js';

export { pingBot, testPush } from '../lib/bots/ping.js';

export {
  deleteCustomization,
  deletePush,
  meDashboard,
  meProfile,
  mySettings,
  newProfile,
  newSetting,
  nextGame,
  saveCustomization,
  savePush,
  saveTags,
  setPush,
} from '../lib/profile/me.js';

export {
  block_player,
  setPublicRivalries,
  unblock_player,
  updateStanding,
} from '../lib/profile/social.js';


export {
  announcementGetAuth,
  announcementPresignUploadAuth,
  announcementPublishAuth,
  announcementReactAuth,
  announcementReactionsMineAuth,
  announcementRetractAuth,
  announcementSaveAuth,
  announcementsAdminListAuth,
  announcementsMarkReadAuth,
} from '../lib/announcements/authHandlers.js';

export {
  feedbackAdminListAuth,
  feedbackCommentAuth,
  feedbackCreateAuth,
  feedbackDeleteAuth,
  feedbackGetAuth,
  feedbackHoldRetentionAuth,
  feedbackMergeAuth,
  feedbackMineAuth,
  feedbackPresignUploadAuth,
  feedbackReclassifyAuth,
  feedbackSetAdminFieldsAuth,
  feedbackSetStatusAuth,
  feedbackSubscribeAuth,
  feedbackUpdateAuth,
  feedbackVoteAuth,
} from '../lib/feedback/authHandlers.js';

export {
  createPlaygroundSaveAuth,
  deletePlaygroundSaveAuth,
  getPlaygroundSaveAuth,
  listPlaygroundSavesAuth,
  savePlaygroundSaveAuth,
} from '../lib/playground/authHandlers.js';

export {
  dismissAllNotificationsAuth,
  dismissNotificationAuth,
  listNotificationsAuth,
  markNotificationsSeenAuth,
} from '../lib/notifications/authHandlers.js';

export {
  highlightGameAuth,
  recommendGameAuth,
  unhighlightGameAuth,
  unrecommendGameAuth,
  unwatchGameAuth,
  watchGameAuth,
} from '../lib/playerGameMarks/authHandlers.js';

export {
  logLayoutEventAuth,
  logRecommendationEventAuth,
} from '../lib/analytics/authHandlers.js';

export {
  allStandingChallenges,
  announcementGetOpen,
  announcementsListOpen,
  archiveTournaments,
  challengeDetails,
  eventGetEvent,
  eventGetEvents,
  feedbackGetOpen,
  feedbackHistoryListOpen,
  feedbackListOpen,
  feedbackWishlistSearchOpen,
  games,
  getOldTournaments,
  getPublicExploration,
  getTournament,
  getTournaments,
  logLayoutEventOpen,
  metaGamesDetails,
  playerAbout,
  playerHighlights,
  recentCompletedGames,
  representativeGames,
  reportProblem,
  standingChallenges,
  userNames,
} from '../lib/public/index.js';
