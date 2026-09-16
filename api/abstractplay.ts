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
import { inAppSettingsMapForUserIds } from '../lib/games/playHandlers.js';
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

registerMoveIntegration({
  eventGameUpdater: eventUpdates,
  tournamentDivisionCompleter: (tournament) => endTournament(tournament as Tournament),
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
  game,
  joinTournament,
  newTournament,
  testAsync,
  withdrawTournament,
};

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
