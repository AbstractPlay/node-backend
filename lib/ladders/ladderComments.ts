import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { GameComment } from '../gameComments.js';
import { wsBroadcast } from '../wsBroadcast.js';
import { getLadderPlayer, getLadderRecord, queryLadderPlayers } from './ladderStore.js';
import { enqueueLadderChatNotifications } from '../notifications.js';

const COMMENT_BLOB_BUDGET = 360_000;
const MAX_COMMENT_LEN = 4000;

export async function getLadderCommentsItem(ladderId: string): Promise<GameComment[]> {
  const data = await ddbDocClient.send(new GetCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: 'LADDERCOMMENTS', sk: ladderId },
  }));
  if (data.Item === undefined) {
    return [];
  }
  const comments = (data.Item as { comments?: GameComment[] }).comments;
  return Array.isArray(comments) ? comments : [];
}

export async function submitLadderComment(
  userid: string,
  pars: { ladderId?: string; comment?: string },
) {
  const ladderId = pars.ladderId;
  if (!ladderId) {
    return formatReturnError('ladderId is required.');
  }
  const text = pars.comment ?? '';
  if (text.length === 0 || /^\s*$/.test(text)) {
    return formatReturnError('Refusing to accept blank comment.');
  }

  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return formatReturnError(`Ladder ${ladderId} not found`);
  }
  const member = await getLadderPlayer(ladderId, userid);
  if (member === undefined || member.membershipStatus !== 'active') {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Only active ladder members may post ladder chat' }),
      headers,
    };
  }

  let comments: GameComment[];
  try {
    comments = await getLadderCommentsItem(ladderId);
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get comments for ladder ${ladderId}`);
  }

  const blobSize = comments.reduce(
    (s, a) => s + 110 + Buffer.byteLength(a.comment, 'utf8'),
    0,
  );
  if (blobSize >= COMMENT_BLOB_BUDGET) {
    return formatReturnError('Ladder chat log is full.');
  }

  const comment: GameComment = {
    comment: text.substring(0, MAX_COMMENT_LEN),
    userId: userid,
    moveNumber: 0,
    timeStamp: Date.now(),
  };
  comments.push(comment);

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: 'LADDERCOMMENTS', sk: ladderId, comments },
    }));
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to save comment for ladder ${ladderId}`);
  }

  try {
    const members = await queryLadderPlayers(ladderId);
    const activeIds = members
      .filter(m => m.membershipStatus === 'active' && m.userid !== userid)
      .map(m => m.userid);
    await enqueueLadderChatNotifications(
      ddbDocClient,
      tableName,
      ladderId,
      ladder.metaGame,
      ladder.variants,
      activeIds,
      userid,
    );
  } catch (error) {
    console.warn('Ladder chat notification enqueue failed:', error);
  }

  await wsBroadcast('ladder', { id: ladderId }, [userid]);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
    headers,
  };
}
