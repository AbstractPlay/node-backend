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

import { registerMoveIntegration } from '../lib/games/moveIntegration.js';
import { endTournament } from '../lib/tournaments/authHandlers.js';
import { eventUpdates } from '../lib/events/authHandlers.js';

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















registerMoveIntegration({
  eventGameUpdater: eventUpdates,
  tournamentDivisionCompleter: (tournament) =>
    endTournament(tournament as import('../lib/tournaments/authHandlers.js').Tournament),
});

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


/** Route dispatch — thin auth glue re-exported from lib (Phase 5). */
export {
  timeloss,
  game,
  testAsync,
};

export {
  endATournament,
  joinTournament,
  newTournament,
  withdrawTournament,
} from '../lib/tournaments/authHandlers.js';

export {
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
} from '../lib/events/authHandlers.js';

export {
  botMove,
  checkForAbandonedGame,
  checkForTimeloss,
  getExploration,
  getPrivateExploration,
  handleMove,
  invokePie,
  markAsPublished,
  saveExploration,
  submitComment,
  submitMove,
} from '../lib/games/playHandlers.js';

export {
  deleteGames,
  fixGames,
  onetimeFix,
  purgeRetiredCompletedGames,
  setLastSeen,
  updateCommented,
  updateMetaGameCounts,
  updateNote,
} from '../lib/games/adminHandlers.js';


export {
  botRespondToChallenge,
  newChallenge,
  respondedChallenge,
  revokeChallenge,
} from '../lib/challenges/authHandlers.js';

export { startSoloGame } from '../lib/games/solo.js';

export {
  injectState,
  toggleStar,
  updateGameSettings,
  updateUserSettings,
} from '../lib/games/playerSettings.js';


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
