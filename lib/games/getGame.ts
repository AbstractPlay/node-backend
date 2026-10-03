import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { User } from '../api/types.js';
import { hydrateGameState } from '../gameState.js';
import { countGameWatchers } from '../playerGameMarks.js';
import { checkAndProcessGameTimeout } from '../dashboardMaintenance.js';
import { setSeenTime } from './setSeenTime.js';
import { timeloss } from './timeloss.js';
import {
  collectPlayerIdsFromGame,
} from '../vacation/load.js';
import { enrichLiveGameClockDisplay } from '../vacation/clockDisplay.js';
import {
  getPlayerVacationFlagsFromMap,
  getVacationWindowFromMap,
  prepareVacationPlayerStateForPlayerIds,
} from '../vacation/persist.js';

type FullGame = {
  id: string;
  metaGame: string;
  sk?: string;
  state: string;
  players: User[];
  toMove?: string | boolean[];
  partialMove?: string;
  gameEnded?: number;
  clockHard?: boolean;
  lastMoveTime?: number;
  clockDisplayServerTime?: number;
  variants?: string[];
  note?: string;
};

export async function game(
  userid: string,
  pars: { id: string; cbit: string | number; metaGame: string; retryAttempt?: number },
) {
  try {
    if (pars.retryAttempt && pars.retryAttempt > 0) {
      console.log(`get_game called with retry attempt ${pars.retryAttempt} for game ${pars.id}, metaGame ${pars.metaGame}`);
    }
    if (pars.cbit !== 0 && pars.cbit !== 1 && pars.cbit !== "0" && pars.cbit !== "1") {
      return formatReturnError('cbit must be 0 or 1');
    }
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'GAME',
          sk: pars.metaGame + '#' + pars.cbit + '#' + pars.id,
        },
      }));
    const getComments = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'GAMECOMMENTS',
          sk: pars.id,
        },
        ReturnConsumedCapacity: 'INDEXES',
      }));
    const getNote = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'NOTE',
          sk: `${pars.id}#${userid}`,
        },
        ReturnConsumedCapacity: 'INDEXES',
      }));
    const watchCountWork = countGameWatchers(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      pars.id,
    );

    const gameData = await getGame;
    let loaded = gameData.Item !== undefined ? hydrateGameState(gameData.Item as FullGame) : undefined;
    if (loaded === undefined && (pars.cbit === 0 || pars.cbit === '0')) {
      const completedGameData = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            pk: 'GAME',
            sk: pars.metaGame + '#1#' + pars.id,
          },
        }));
      loaded = completedGameData.Item !== undefined
        ? hydrateGameState(completedGameData.Item as FullGame)
        : undefined;
    }
    if (loaded === undefined) {
      throw new Error(`Game ${pars.id}, metaGame ${pars.metaGame}, completed bit ${pars.cbit} not found`);
    }
    let activeGameNow: number | undefined;
    let vacationState: Awaited<ReturnType<typeof prepareVacationPlayerStateForPlayerIds>> | undefined;
    if ((pars.cbit === 0 || pars.cbit === '0') && loaded.toMove && loaded.toMove !== '') {
      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      activeGameNow = Date.now();
      const now = activeGameNow;
      const timeoutGame = {
        id: loaded.id,
        metaGame: loaded.metaGame,
        clockHard: loaded.clockHard ?? false,
        players: loaded.players.map(p => ({
          id: p.id,
          name: p.name,
          time: p.time,
        })),
        toMove: loaded.toMove as string | boolean[],
        lastMoveTime: loaded.lastMoveTime!,
        variants: loaded.variants,
      };
      const allPlayerIds = collectPlayerIdsFromGame(loaded);
      vacationState = await prepareVacationPlayerStateForPlayerIds(
        ddbDocClient,
        tableName,
        allPlayerIds,
        now,
      );
      const timeoutResult = await checkAndProcessGameTimeout(timeoutGame, {
        client: ddbDocClient,
        tableName,
        timeloss,
        now: () => now,
        getVacationWindow: getVacationWindowFromMap(vacationState.windows),
      });
      if (timeoutResult.processed) {
        const refreshed = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              pk: 'GAME',
              sk: `${pars.metaGame}#0#${pars.id}`,
            },
          }),
        );
        if (refreshed.Item) {
          loaded = hydrateGameState(refreshed.Item as FullGame);
        } else {
          const completed = await ddbDocClient.send(
            new GetCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: {
                pk: 'GAME',
                sk: `${pars.metaGame}#1#${pars.id}`,
              },
            }),
          );
          if (completed.Item) {
            loaded = hydrateGameState(completed.Item as FullGame);
          }
        }
      }
    }
    if (
      loaded.lastMoveTime !== undefined
      && loaded.toMove
      && loaded.toMove !== ''
    ) {
      const displayNow = activeGameNow ?? Date.now();
      if (vacationState === undefined) {
        const tableName = process.env.ABSTRACT_PLAY_TABLE!;
        vacationState = await prepareVacationPlayerStateForPlayerIds(
          ddbDocClient,
          tableName,
          collectPlayerIdsFromGame(loaded),
          displayNow,
        );
      }
      const withClock = enrichLiveGameClockDisplay(
        {
          players: loaded.players,
          toMove: loaded.toMove,
          lastMoveTime: loaded.lastMoveTime,
        },
        displayNow,
        getVacationWindowFromMap(vacationState.windows),
        getPlayerVacationFlagsFromMap(vacationState.flags),
      );
      loaded.players = withClock.players;
      loaded.clockDisplayServerTime = withClock.clockDisplayServerTime;
    }
    if (userid !== undefined && userid !== null && userid !== '') {
      await setSeenTime(userid, pars.id);
    }
    const flags = gameinfo.get(loaded.metaGame).flags;
    if (flags !== undefined && flags.includes('simultaneous') && loaded.partialMove !== undefined) {
      const players = loaded.players;
      loaded.partialMove = loaded.partialMove.split(',').map((m: string, i: number) => (players[i].id === userid ? m : '')).join(',');
    }
    const noteData = await getNote;
    console.log(`Fetched notes:\n${JSON.stringify(noteData)}`);
    if (noteData.Item !== undefined && noteData.Item.note) {
      loaded.note = noteData.Item.note as string;
    }
    let comments: unknown[] = [];
    const commentData = await getComments;
    if (commentData.Item !== undefined && commentData.Item.comments) {
      comments = commentData.Item.comments as unknown[];
    }

    if (loaded.gameEnded === undefined) {
      const engine = GameFactory(loaded.metaGame, loaded.state);
      if (engine === undefined) {
        throw new Error(`Could not rehydrate the state for id "${pars.id}", cbit "${pars.cbit}", meta "${pars.metaGame}".`);
      }
      if (!engine.gameover) {
        let player: number | undefined;
        const pidx = loaded.players.findIndex(p => p.id === userid);
        if (pidx >= 0) {
          player = pidx + 1;
        }
        loaded.state = engine.serialize({ strip: true, player });
      }
    }

    const watchCount = await watchCountWork;
    console.log('Returning 200.');
    return {
      statusCode: 200,
      body: JSON.stringify({ game: loaded, comments, watchCount }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get ${pars.metaGame} game ${pars.id}, completed bit ${pars.cbit} from DB`);
  }
}
