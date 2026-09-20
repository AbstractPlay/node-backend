/* eslint-disable @typescript-eslint/no-explicit-any */
import './registerMoveHooks.js';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type GetCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, type SendMessageRequest } from '@aws-sdk/client-sqs';
import {
  gameinfo,
  GameFactory,
  GameBase,
  GameBaseSimultaneous,
} from '@abstractplay/gameslib';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient, sqsClient } from '../api/clients.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
  handleCommonErrors,
} from '../api/http.js';
import type { User } from '../api/types.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import { effectiveFlags, flagSetIncludes, structuralFlags } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage, setGameEndedFromEngine } from '../gameState.js';
import { adminDeleteGame } from '../adminDeleteGame.js';
import { filterExplorationTreeForSave, type ExplorationTreeNode } from '../explorationMoves.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import { checkAndProcessGameTimeout } from '../dashboardMaintenance.js';
import {
  shouldWriteGameOpenOverlay,
} from '../dashboardGames.js';
import { upsertUserGameOverlay } from '../userGameOverlay.js';
import { checkInGameCommentAuth } from '../commentAuth.js';
import {
  countGameWatchers,
  updateLastChatForWatchers,
  updateWatcherSummaries,
  type GameMarkSummary,
} from '../playerGameMarks.js';
import {
  isBotId,
  getParticipants,
  getBotRecord,
  filterHumanIds,
  botToFullUserStub,
} from '../participants.js';
import { enqueueBotOutbound, getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { notifyRegisteredBotsTurn } from '../bots/notifyTurn.js';
import { realPingBot } from '../bots/realPingBot.js';
import { getPlayers } from '../players/getPlayers.js';
import { timeloss } from './timeloss.js';
import { sendUserPush } from '../push/sendUserPush.js';
import {
  createNotification,
  enqueueCompletedGameChatNotifications,
  enqueueGameEndNotifications,
  collectGameEndScoresFromEngine,
  formatNotificationScores,
  inAppSettingsMapFromUsers,
  optionalNotificationNote,
  type InAppNotificationUserSettings,
  type NotificationGame,
  type NotificationScore,
} from '../notifications.js';
import {
  queryRecentCompletedGames,
  updateCompletedGameCommentedFlag,
} from '../recentCompletedGames.js';
import { setSeenTime } from './setSeenTime.js';
import { wsBroadcast } from '../wsBroadcast.js';
import type { PutCommandOutput, UpdateCommandOutput, DeleteCommandOutput } from '@aws-sdk/lib-dynamodb';
import { validateToken } from '@sunknudsen/totp';
import { getUsersLastSeen } from '../touchUserLastSeen.js';
import { hasCurrentGameRow } from '../dashboardGames.js';
import { setWatchedSeen } from '../playerGameMarks.js';
import { callEventGameUpdater, callTournamentDivisionCompleter } from './moveIntegration.js';


type FullUser = {
  id: string;
  name: string;
  email: string;
  language: string | undefined;
  settings?: import('../api/types.js').UserSettings;
  isBot?: boolean;
};

type Tournament = {
  divisions?: Record<string, { numCompleted: number; numGames: number; processed: boolean }>;
};

type Note = {
  pk: string;
  sk: string;
  note: string;
};


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
  system?: boolean;
}

/** Player-authored in-game chat only (not pie / system log lines). */
function isUserChatComment(userId: string): boolean {
  return userId.trim().length > 0;
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

export async function inAppSettingsMapForUserIds(userIds: string[]) {
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

export async function submitMove(userid: string, pars: {
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
        list.push(callEventGameUpdater({ eventid: game.event, gameid: pars.id, winner: winners }))
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
    work.push(callTournamentDivisionCompleter(tournament))
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
        work.push(sendUserPush({
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
      work.push(sendUserPush({
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

export async function invokePie(userid: string, pars: { id: string, metaGame: string, cbit: number }) {
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

export async function botMove(pars: { uid: string, token: string, metaGame: string, gameid: string, move: string }) {
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

export async function checkForAbandonedGame(userid: string, pars: { id: string, metaGame: string }) {
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

export async function checkForTimeloss(userid: string, pars: { id: string, metaGame: string }) {
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

export async function submitComment(userid: string, pars: { id: string; metaGame: string; players?: { [k: string]: any; id: string }[]; comment: string; moveNumber: number; }) {
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

  const userComment = isUserChatComment(userid);

  // Check if there were any interesting player comments before adding the new one
  const hadInterestingCommentBefore = comments.some(
    (c) => isUserChatComment(c.userId) && isInterestingComment(c.comment),
  );

  let commentSaved = false;
  if (comments.reduce((s: number, a: Comment) => s + 110 + Buffer.byteLength(a.comment, 'utf8'), 0) < 360000) {
    const comment: Comment = {
      comment: pars.comment.substring(0, 4000),
      userId: userid,
      moveNumber: pars.moveNumber,
      timeStamp: Date.now(),
      ...(!userComment ? { system: true } : {}),
    };
    comments.push(comment);
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMECOMMENTS",
        "sk": pars.id,
        "comments": comments
      }
    }));
    commentSaved = true;

    // Check if the new comment is interesting
    const newCommentIsInteresting = userComment && isInterestingComment(comment.comment);

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

  // Update lastChat for dashboard unread when a player comment was actually saved
  // Note: For completed games, comments go through the exploration system (saveExploration)
  if (commentSaved && userComment && pars.players && pars.metaGame) {
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

export async function saveExploration(userid: string, pars: { public: boolean, game: string; metaGame: string; move: number; version: number; tree: ExplorationTreeNode | ExplorationTreeNode[]; updateCommentedFlag?: number; gameEnded?: number; updateLastChat?: boolean; players?: { [k: string]: any; id: string; name?: string }[]; }) {
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

export async function getExploration(userid: string, pars: { game: string; move: number }) {
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
export async function getPrivateExploration(userid: string, pars: { id: string }) {
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
export async function markAsPublished(userid: string, pars: { id: string; metagame: string }) {
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

