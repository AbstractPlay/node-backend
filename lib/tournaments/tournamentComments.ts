import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { GameComment } from '../gameComments.js';
import { inAppSettingsMapForUserIds } from '../games/playHandlers.js';
import { enqueueTournamentChatNotifications } from '../notifications.js';
import { wsBroadcast } from '../wsBroadcast.js';
import {
  checkTournamentCommentAuth,
  listTournamentChatPlayers,
} from './tournamentCommentAuth.js';
import { findCompletedTournament } from './completedTournamentLookup.js';

const COMMENT_BLOB_BUDGET = 360_000;
const MAX_COMMENT_LEN = 4000;

type TournamentMeta = {
  metaGame: string;
  variants: string[];
};

async function loadTournamentMeta(
  tournamentId: string,
  metaGame?: string,
): Promise<TournamentMeta | undefined> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const active = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'TOURNAMENT', sk: tournamentId },
    }),
  );
  if (active.Item !== undefined) {
    const t = active.Item as { metaGame?: string; variants?: string[] };
    if (t.metaGame) {
      return { metaGame: t.metaGame, variants: t.variants ?? [] };
    }
  }

  if (metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined') {
    const archived = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          pk: 'COMPLETEDTOURNAMENT',
          sk: `${metaGame}#${tournamentId}`,
        },
      }),
    );
    if (archived.Item !== undefined) {
      const t = archived.Item as { metaGame?: string; variants?: string[] };
      return {
        metaGame: t.metaGame ?? metaGame,
        variants: t.variants ?? [],
      };
    }
  }

  const item = await findCompletedTournament(
    ddbDocClient,
    tableName,
    tournamentId,
  ) as { metaGame?: string; variants?: string[] } | undefined;
  if (item?.metaGame) {
    return { metaGame: item.metaGame, variants: item.variants ?? [] };
  }
  return undefined;
}

export async function getTournamentCommentsItem(
  tournamentId: string,
): Promise<GameComment[]> {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'TOURNAMENTCOMMENTS',
        sk: tournamentId,
      },
    }),
  );
  if (data.Item === undefined) {
    return [];
  }
  const comments = (data.Item as { comments?: GameComment[] }).comments;
  return Array.isArray(comments) ? comments : [];
}

export async function submitTournamentComment(
  userid: string,
  pars: { tournamentid: string; comment: string; metaGame?: string },
) {
  const tournamentId = pars.tournamentid;
  if (!tournamentId) {
    return formatReturnError('tournamentid is required.');
  }
  if (pars.comment.length === 0 || /^\s*$/.test(pars.comment)) {
    return formatReturnError('Refusing to accept blank comment.');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;

  try {
    const auth = await checkTournamentCommentAuth(
      ddbDocClient,
      tableName,
      userid,
      tournamentId,
      pars.metaGame,
    );
    if (!auth.ok) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: auth.message }),
        headers,
      };
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(
      `Unable to verify permissions for user ${userid} on tournament ${tournamentId}`,
    );
  }

  let comments: GameComment[];
  try {
    comments = await getTournamentCommentsItem(tournamentId);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(
      `Unable to get comments for tournament ${tournamentId}`,
    );
  }

  const blobSize = comments.reduce(
    (s, a) => s + 110 + Buffer.byteLength(a.comment, 'utf8'),
    0,
  );
  if (blobSize >= COMMENT_BLOB_BUDGET) {
    return formatReturnError('Tournament chat log is full.');
  }

  const comment: GameComment = {
    comment: pars.comment.substring(0, MAX_COMMENT_LEN),
    userId: userid,
    moveNumber: 0,
    timeStamp: Date.now(),
  };
  comments.push(comment);

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: 'TOURNAMENTCOMMENTS',
          sk: tournamentId,
          comments,
        },
      }),
    );
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(
      `Unable to save comment for tournament ${tournamentId}`,
    );
  }

  const meta = await loadTournamentMeta(tournamentId, pars.metaGame);
  const players = await listTournamentChatPlayers(
    ddbDocClient,
    tableName,
    tournamentId,
    pars.metaGame ?? meta?.metaGame,
  );

  if (meta !== undefined && players.length > 0) {
    try {
      const chatSettings = await inAppSettingsMapForUserIds(players.map((p) => p.id));
      await enqueueTournamentChatNotifications(
        ddbDocClient,
        tableName,
        tournamentId,
        meta.metaGame,
        meta.variants,
        players,
        userid,
        { settingsByUserId: chatSettings },
      );
    } catch (error) {
      console.warn('Tournament chat notification enqueue failed:', error);
    }
  }

  await wsBroadcast('tournament', { id: tournamentId }, [userid]);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
}
