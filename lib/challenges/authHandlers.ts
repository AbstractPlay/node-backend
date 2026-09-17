import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient } from '../api/clients.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { User } from '../api/types.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import { effectiveFlags, applyPerspectivePlayerRotations } from '../effectiveGameFlags.js';
import { adjustShardedCounts } from '../gameProjector.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import {
  isBotId,
  getParticipants,
  filterHumanIds,
} from '../participants.js';
import { enqueueBotOutbound } from '../botOutbound.js';
import { notifyRegisteredBotsTurn } from '../bots/notifyTurn.js';
import { realPingBot } from '../bots/realPingBot.js';
import { getPlayers } from '../players/getPlayers.js';
import { declinesDirectChallenges } from '../challenges.js';
import { validateChallengeVariantUids } from './variantUids.js';
import { shuffle } from './shuffle.js';
import {
  applySeatLeave,
  effectiveOpenSlots,
  validateDirectChallengeSeats,
} from './seatAccounting.js';
import {
  deleteFillableProjection,
  syncFillableProjection,
} from './fillableProjection.js';
import { loadChallengeById } from './loadChallenge.js';
import { getChallenges } from '../profile/me.js';
import { loadDashboardGames } from '../dashboardGames.js';
import { sendUserPush } from '../push/sendUserPush.js';
import {
  createNotification,
  enqueueGameStartNotifications,
  inAppSettingsMapFromUsers,
  optionalNotificationNote,
  type InAppNotificationUserSettings,
} from '../notifications.js';

type Challenge = {
  metaGame: string;
  standing?: boolean;
  challenger: User;
  players: User[];
  challengees?: User[];
};

type FullChallenge = {
  pk?: string;
  sk?: string;
  id?: string;
  metaGame: string;
  numPlayers: number;
  standing?: boolean;
  duration?: number;
  seating: string;
  variants: string[];
  challenger: User;
  challengees?: User[];
  players?: User[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  comment?: string;
  dateIssued?: number;
  openSlots?: number;
  fillableDirect?: boolean;
};

type FullUser = {
  id: string;
  name: string;
  email: string;
  language: string;
  settings: import('../api/types.js').UserSettings;
  challenges_received?: Set<string>;
};

export async function newChallenge(userid: string, challenge: FullChallenge) {
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

  const openSlots = challenge.openSlots ?? 0;
  const seatErr = validateDirectChallengeSeats(
    challenge.numPlayers,
    (challenge.challengees ?? []) as User[],
    openSlots,
  );
  if (seatErr) {
    return formatReturnError(seatErr);
  }

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
      "openSlots": openSlots,
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
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
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

    if (openSlots > 0) {
      await syncFillableProjection(
        ddbDocClient,
        tableName,
        {
          id: challengeId,
          metaGame: challenge.metaGame,
          standing: false,
          openSlots,
          numPlayers: challenge.numPlayers,
          seating: challenge.seating,
          variants: challenge.variants,
          challenger: challenge.challenger,
          players: [challenge.challenger],
          challengees: challenge.challengees,
          clockStart: challenge.clockStart,
          clockInc: challenge.clockInc,
          clockMax: challenge.clockMax,
          clockHard: challenge.clockHard,
          rated: challenge.rated,
          noExplore: challenge.noExplore || false,
          comment: challenge.comment || "",
          dateIssued: Date.now(),
        },
        (mg, d) => updateStandingChallengeCount(mg, d),
      );
    }

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
    work.push(sendUserPush({
      userId: player.id,
      topic: "challenges",
      title: i18n.t("PUSH.titles.challenged"),
      body: body,
      url: "/",
    }));
  }
  return Promise.all(work);
}

export async function revokeChallenge(userid: any, pars: { id: string; metaGame: string; standing: boolean; comment: string; }) {
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
        work.push(sendUserPush({
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
        work.push(sendUserPush({
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

export async function respondedChallenge(userid: string, pars: { response: boolean; id: string; standing?: boolean; metaGame: string; comment: string; }) {
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
          work.push(sendUserPush({
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
    let partialLeave = false;
    try {
      const removeResult = await removeChallenge(pars.id, pars.metaGame, standing, false, userid);
      challenge = removeResult.challenge;
      work2 = removeResult.work;
      partialLeave = removeResult.partialLeave === true;
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
    if (challenge !== undefined) {
      await initi18n('en');
      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      const quitterParts = await getParticipants([userid]);
      const quitterName = quitterParts[0]?.name ?? userid;
      const declineNote = !standing ? optionalNotificationNote(pars.comment) : undefined;
      const metaGameDisplay = localizedGameName(challenge.metaGame);
      const openAfter = effectiveOpenSlots(challenge as FullChallenge);

      if (partialLeave) {
        const challengerId = challenge.challenger.id;
        const challengerUsers = await getPlayers([challengerId]);
        const challenger = challengerUsers[0];
        if (challenger) {
          await changeLanguageForPlayer(challenger);
          let body = i18n.t("ChallengeSlotOpenedChallengerBody", {
            quitter: quitterName,
            metaGame: metaGameDisplay,
            count: openAfter,
          });
          if (comment !== ".") {
            body += " " + i18n.t("ChallengeResponseComment", { comment });
          }
          if (challenger.email) {
            if ((challenger.settings?.all?.notifications === undefined) || (challenger.settings.all.notifications.challenges)) {
              work.push(sesClient.send(createSendEmailCommand(
                challenger.email,
                challenger.name,
                i18n.t("ChallengeSlotOpenedSubject"),
                body,
              )));
            }
          }
          work.push(sendUserPush({
            userId: challengerId,
            topic: "challenges",
            title: i18n.t("PUSH.titles.slotOpened"),
            body,
            url: "/",
          }));
          work.push(createNotification(ddbDocClient, tableName, challengerId, {
            type: 'challengeSlotOpened',
            challengeId: pars.id,
            metaGame: challenge.metaGame,
            participantId: userid,
            participantName: quitterName,
            openSlots: openAfter,
            ...(declineNote ? { note: declineNote } : {}),
          }, {
            userSettings: challenger.settings as InAppNotificationUserSettings | undefined,
          }));
        }

        const otherIds = await filterHumanIds(
          challenge.players
            .map(c => c.id)
            .concat((challenge.challengees ?? []).map(c => c.id))
            .filter(id => id !== userid && id !== challengerId),
        );
        const others = await getPlayers(otherIds);
        for (const player of others) {
          await changeLanguageForPlayer(player);
          let body = i18n.t("ChallengeParticipantLeftBody", { quitter: quitterName, metaGame: metaGameDisplay });
          if (comment !== ".") {
            body += " " + i18n.t("ChallengeResponseComment", { comment });
          }
          work.push(sendUserPush({
            userId: player.id,
            topic: "challenges",
            title: i18n.t("PUSH.titles.participantLeft"),
            body,
            url: "/",
          }));
          if (!standing) {
            work.push(createNotification(ddbDocClient, tableName, player.id, {
              type: 'challengeParticipantLeft',
              challengeId: pars.id,
              metaGame: challenge.metaGame,
              participantId: userid,
              participantName: quitterName,
            }, {
              userSettings: player.settings as InAppNotificationUserSettings | undefined,
            }));
          }
        }
      } else {
        const players: FullUser[] = await getPlayers(await filterHumanIds(
          (challenge.challengees ?? []).map(c => c.id).filter(id => id !== userid)
            .concat(challenge.players.map(c => c.id)),
        ));
        for (const player of players) {
          await changeLanguageForPlayer(player);
          let body = i18n.t("ChallengeRejectedBody", { quitter: quitterName, metaGame: metaGameDisplay });
          if (comment !== ".") {
            body += " " + i18n.t("ChallengeResponseComment", { comment });
          }
          if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
            if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges)) {
              const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), body);
              work.push(sesClient.send(comm));
            }
          }
          work.push(sendUserPush({
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
              declinerName: quitterName,
              ...(declineNote ? { note: declineNote } : {}),
            }, {
              userSettings: player.settings as InAppNotificationUserSettings | undefined,
            }));
          }
        }
      }
    }
  }
  await Promise.all(work);
  return ret;
}

type RemoveChallengeResult = {
  challenge?: Challenge & { openSlots?: number; challengees?: User[] };
  work?: Promise<unknown>;
  partialLeave?: boolean;
};

async function removeChallenge(
  challengeId: string,
  metaGame: string,
  standing: boolean,
  revoked: boolean,
  quitter: string,
): Promise<RemoveChallengeResult> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const loaded = await loadChallengeById(ddbDocClient, tableName, challengeId, metaGame, {
    preferStanding: standing,
  });
  if (loaded === undefined) {
    console.log("Challenge not found");
    return { challenge: undefined, work: undefined };
  }
  const challenge = loaded.item as Challenge & FullChallenge;
  const storageStanding = loaded.isStanding;
  if (revoked && challenge.challenger.id !== quitter) {
    throw new Error(`${quitter} tried to revoke a challenge that they did not create.`);
  }
  const inPlayers = challenge.players?.find((p: { id: string }) => p.id === quitter);
  const inChallengees = challenge.challengees?.find((p: { id: string }) => p.id === quitter);
  if (!revoked && !inPlayers && !inChallengees) {
    throw new Error(`${quitter} tried to leave a challenge that they are not part of.`);
  }

  if (!revoked) {
    const leave = applySeatLeave(challenge as FullChallenge, quitter);
    if (leave.mode === 'partial') {
      return {
        challenge: leave.challenge as Challenge & FullChallenge,
        work: partialRemoveChallenge(loaded, leave.challenge as FullChallenge, quitter, storageStanding),
        partialLeave: true,
      };
    }
  }

  return {
    challenge,
    work: removeAChallenge(challenge, storageStanding, revoked, false, quitter, loaded),
    partialLeave: false,
  };
}

async function partialRemoveChallenge(
  loaded: Awaited<ReturnType<typeof loadChallengeById>>,
  challenge: FullChallenge,
  quitter: string,
  storageStanding: boolean,
): Promise<void> {
  if (loaded === undefined) {
    return;
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const list: Promise<unknown>[] = [];
  const pk = loaded.storagePk;
  const item = {
    ...challenge,
    pk,
    sk: challenge.sk ?? (challenge as { id?: string }).id,
  };
  list.push(ddbDocClient.send(new PutCommand({
    TableName: tableName,
    Item: item,
  })));

  const challengeId = String((challenge as { id?: string; sk?: string }).id ?? challenge.sk);
  const standingKey = `${challenge.metaGame}#${challengeId}`;

  if (!(await isBotId(quitter))) {
    if (!storageStanding) {
      list.push(sendCommandWithRetry(new UpdateCommand({
        TableName: tableName,
        Key: { pk: "USER", sk: quitter },
        UpdateExpression: "DELETE challenges_received :c",
        ExpressionAttributeValues: { ":c": new Set([challengeId]) },
      })));
      list.push(sendCommandWithRetry(new UpdateCommand({
        TableName: tableName,
        Key: { pk: "USER", sk: quitter },
        UpdateExpression: "DELETE challenges_accepted :c",
        ExpressionAttributeValues: { ":c": new Set([challengeId]) },
      })));
    } else {
      list.push(sendCommandWithRetry(new UpdateCommand({
        TableName: tableName,
        Key: { pk: "USER", sk: quitter },
        UpdateExpression: "DELETE challenges_accepted :c",
        ExpressionAttributeValues: { ":c": new Set([standingKey]) },
      })));
    }
  }

  if (!storageStanding) {
    if (effectiveOpenSlots(challenge) > 0) {
      list.push(syncFillableProjection(
        ddbDocClient,
        tableName,
        { ...challenge, id: challengeId } as FullChallenge & { id: string },
        (mg, d) => updateStandingChallengeCount(mg, d),
      ));
    } else {
      list.push(deleteFillableProjection(
        ddbDocClient,
        tableName,
        challenge.metaGame,
        challengeId,
        (mg, d) => updateStandingChallengeCount(mg, d),
      ));
    }
  }

  await Promise.all(list);
}

// Remove the challenge either because the game has started, or someone withrew: either challenger revoked the challenge or someone withdrew an acceptance, or didn't accept the challenge.
async function removeAChallenge(
  challenge: { [x: string]: any; challenger?: any; id?: any; challengees?: any; numPlayers?: any; metaGame?: any; players?: any; sk?: string },
  standing: boolean,
  revoked: boolean,
  started: boolean,
  quitter: string,
  _loaded?: Awaited<ReturnType<typeof loadChallengeById>>,
) {
  const list: Promise<any>[] = [];
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const challengeId = String(challenge.id ?? challenge.sk);

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
    for (const challengee of challenge.challengees ?? []) {
      if (!(await isBotId(challengee.id))) {
        list.push(sendCommandWithRetry(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          UpdateExpression: "DELETE challenges_received :c",
          ExpressionAttributeValues: { ":c": new Set([challenge.id]) }
        })));
      }
    }
    list.push(deleteFillableProjection(
      ddbDocClient,
      tableName,
      challenge.metaGame,
      challengeId,
      (mg, d) => updateStandingChallengeCount(mg, d),
    ));
  } else if (revoked || expired) {
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
  } else if (revoked || expired) {
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
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const loaded = await loadChallengeById(ddbDocClient, tableName, challengeId, metaGame, {
    preferStanding: standing,
  });

  if (loaded === undefined) {
    console.log("Challenge not found");
    return;
  }

  const challenge = loaded.item as FullChallenge;
  const storageStanding = loaded.isStanding;
  const namedChallengee = challenge.challengees?.find(c => c.id === userid);
  const openSlotAccept =
    !storageStanding
    && challenge.numPlayers > 2
    && !namedChallengee
    && effectiveOpenSlots(challenge) > 0;

  if (!storageStanding && !namedChallengee && !openSlotAccept) {
    logGetItemError(`userid ${userid} wasn't a challengee, challenge ${challengeId}`);
    throw new Error("Can't accept a challenge if you weren't challenged");
  }

  let challengees = standing || !challenge.challengees ? [] : challenge.challengees.filter(c => c.id !== userid);
  if (!storageStanding && namedChallengee && challengees.length !== (challenge.challengees?.length ?? 0) - 1) {
    logGetItemError(`userid ${userid} wasn't a challengee, challenge ${challengeId}`);
    throw new Error("Can't accept a challenge if you weren't challenged");
  }
  if (openSlotAccept) {
    challenge.openSlots = effectiveOpenSlots(challenge) - 1;
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
    list.push(removeAChallenge(challenge, storageStanding, false, true, '', loaded));

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
    let newplayer: User;
    if (namedChallengee) {
      newplayer = namedChallengee;
    } else {
      const playerFull = await getParticipants([userid]);
      newplayer = { id: playerFull[0].id, name: playerFull[0].name };
    }
    challenge.challengees = challengees;
    players!.push(newplayer);
    const storagePk = loaded.storagePk;
    const persistId = String(challenge.id ?? challenge.sk ?? challengeId);
    const updateChallenge = ddbDocClient.send(new PutCommand({
      TableName: tableName,
      Item: {
        ...challenge,
        pk: storagePk,
        sk: persistId,
        id: persistId,
      },
    }));

    const acceptedKey = storageStanding ? `${challenge.metaGame}#${persistId}` : persistId;
    const challengeValue = new Set([acceptedKey]);

    const userUpdates: Promise<unknown>[] = [updateChallenge];
    if (!storageStanding && effectiveOpenSlots(challenge) >= 0) {
      userUpdates.push(syncFillableProjection(
        ddbDocClient,
        tableName,
        { ...challenge, id: persistId } as FullChallenge & { id: string },
        (mg, d) => updateStandingChallengeCount(mg, d),
      ));
      if (effectiveOpenSlots(challenge) === 0) {
        userUpdates.push(deleteFillableProjection(
          ddbDocClient,
          tableName,
          challenge.metaGame,
          persistId,
          (mg, d) => updateStandingChallengeCount(mg, d),
        ));
      }
    }
    if (!(await isBotId(userid))) {
      if (namedChallengee) {
        userUpdates.push(sendCommandWithRetry(new UpdateCommand({
          TableName: tableName,
          Key: { pk: "USER", sk: userid },
          UpdateExpression: "DELETE challenges_received :c",
          ExpressionAttributeValues: { ":c": challengeValue },
        })));
      }
      userUpdates.push(sendCommandWithRetry(new UpdateCommand({
        TableName: tableName,
        Key: { pk: "USER", sk: userid },
        UpdateExpression: "ADD challenges_accepted :c",
        ExpressionAttributeValues: { ":c": challengeValue },
      })));
    }

    await Promise.all(userUpdates);
    return;
  }
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
