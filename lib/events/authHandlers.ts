/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  gameinfo,
  GameFactory,
  GameBase,
  GameBaseSimultaneous,
} from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import type { User } from '../api/types.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { effectiveFlags, applyPerspectivePlayerRotations } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { getPlayers } from '../players/getPlayers.js';
import { inAppSettingsMapForUserIds } from '../games/playHandlers.js';
import {
  enqueueEventInvitationNotifications,
  enqueueGameStartNotifications,
  resolveEventInvitationNotifyIds,
  type NotificationGame,
} from '../notifications.js';

type FullUser = {
  id: string;
  name: string;
  email: string;
  admin?: boolean;
  organizer?: boolean;
  settings?: import('../api/types.js').UserSettings;
};

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
  commented?: number;
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

export async function eventCreate(userid: string, pars: { name: string, date: number, description: string, maxPlayers: number }) {
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

export async function eventPublish(userid: string, pars: { eventid: string }) {
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

export async function eventDelete(userid: string, pars: { eventid: string }) {
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

export async function eventRegister(userid: string, pars: { eventid: string }) {
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

export async function eventWithdraw(userid: string, pars: { eventid: string }) {
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

export async function eventUpdateStart(userid: string, pars: { eventid: string, newDate: number }) {
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

export async function eventUpdateName(userid: string, pars: { eventid: string, name: string }) {
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

export async function eventUpdateDesc(userid: string, pars: { eventid: string, description: string }) {
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

export async function eventUpdateInvites(userid: string, pars: { eventid: string, invited: string[], blocked: string[] }) {
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

export async function eventUpdateResult(userid: string, pars: { eventid: string, gameid: string, result: string[] }) {
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
export async function eventUpdateDivisions(userid: string, pars: { eventid: string; divisions: DivisionTable }) {
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

export async function eventCreateGames(userid: string, pars: { eventid: string; pairs: Pairing[] }) {
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

export async function eventClose(userid: string, pars: { eventid: string, winner: string[] }) {
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

export async function eventUpdates(pars: { eventid: string, gameid: string, winner: string[] }): Promise<any[]> {
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
