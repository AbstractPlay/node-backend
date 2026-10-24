import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const table = process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-prod';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const resp = await client.send(new QueryCommand({
  TableName: table,
  KeyConditionExpression: 'pk = :pk',
  ExpressionAttributeValues: { ':pk': 'TOURNAMENT' },
}));

async function divisionGameStats(tid, divNum, metaGame) {
  const skPrefix = `${tid}#${divNum}#`;
  const q = await client.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': 'TOURNAMENTGAME', ':sk': skPrefix },
  }));
  const items = q.Items ?? [];
  let withWinner = 0;
  let openOnBoard = 0;
  let lastEnd = 0;
  let lastGameId = '';
  let lastWasTimeout = false;
  for (const tg of items) {
    if (tg.winner !== undefined && tg.winner !== null) withWinner++;
    const gid = tg.sk.split('#').pop();
    const g0 = await client.send(new GetCommand({
      TableName: table,
      Key: { pk: 'GAME', sk: `${metaGame}#0#${gid}` },
    }));
    const g1 = await client.send(new GetCommand({
      TableName: table,
      Key: { pk: 'GAME', sk: `${metaGame}#1#${gid}` },
    }));
    const item = g0.Item ?? g1.Item;
    if (!item) continue;
    if (item.toMove !== undefined && item.toMove !== '') openOnBoard++;
    const ended = item.gameEnded ?? 0;
    if (ended >= lastEnd) {
      lastEnd = ended;
      lastGameId = gid;
      lastWasTimeout = false;
      if (typeof item.state === 'string') {
        try {
          const st = JSON.parse(item.state);
          const stack = st.stack ?? [];
          const lastmove = stack[stack.length - 1]?.lastmove ?? '';
          if (lastmove === 'timeout') lastWasTimeout = true;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return {
    tournamentGames: items.length,
    withWinner,
    openOnBoard,
    lastEndIso: lastEnd ? new Date(lastEnd).toISOString() : null,
    lastGameId,
    lastWasTimeout,
  };
}

const categories = {
  completeUnprocessed: [],
  overCompleted: [],
};

for (const t of resp.Items ?? []) {
  const divisions = t.divisions ?? {};
  if (Object.keys(divisions).length === 0) continue;
  for (const [num, d] of Object.entries(divisions)) {
    const nc = d.numCompleted ?? 0;
    const ng = d.numGames ?? 0;
    const proc = d.processed === true;
    if (proc || ng === 0) continue;

    const base = {
      id: t.id ?? t.sk,
      metaGame: t.metaGame,
      number: t.number,
      started: t.started,
      dateEnded: t.dateEnded,
      division: num,
      numCompleted: nc,
      numGames: ng,
      url: `https://play.abstractplay.com/tournament/${t.id ?? t.sk}`,
    };

    if (nc === ng) {
      categories.completeUnprocessed.push(base);
    } else if (nc > ng) {
      categories.overCompleted.push(base);
    }
  }
}

for (const row of [...categories.completeUnprocessed, ...categories.overCompleted]) {
  row.stats = await divisionGameStats(row.id, row.division, row.metaGame);
}

const trulyStuck = categories.completeUnprocessed.filter((r) => {
  const s = r.stats;
  return s.tournamentGames === r.numGames
    && s.withWinner === r.numGames
    && s.openOnBoard === 0;
});

console.log(JSON.stringify({
  table,
  totalActiveTournamentRows: resp.Items?.length ?? 0,
  summary: {
    counterCompleteButUnprocessed: categories.completeUnprocessed.length,
    counterOverNumGames: categories.overCompleted.length,
    verifiedAllGamesFinished: trulyStuck.length,
  },
  verifiedStuck: trulyStuck,
  completeUnprocessedCounterOnly: categories.completeUnprocessed.filter(
    (r) => !trulyStuck.some((t) => t.id === r.id),
  ),
  overCompleted: categories.overCompleted,
}, null, 2));
