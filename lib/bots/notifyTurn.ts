import { sessionIsSimultaneous } from '../effectiveGameFlags.js';
import { enqueueBotOutbound, getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { isBotId } from '../participants.js';

type FullGame = {
  metaGame: string;
  toMove: string | boolean[];
  players: { id: string }[];
};

export async function notifyRegisteredBotsTurn(metaGame: string, gameid: string, game?: FullGame) {
  let loaded = game;
  if (!loaded) {
    const item = await loadGameRecord(metaGame, gameid);
    if (!item) {
      return;
    }
    loaded = item as FullGame;
  }
  const simultaneous = sessionIsSimultaneous(undefined, metaGame, {
    variants: (loaded as { variants?: string[] }).variants,
    numplayers: loaded.players.length,
  });
  const toMoveIds = getToMovePlayerIds(loaded, simultaneous);
  for (const id of toMoveIds) {
    if (await isBotId(id)) {
      await enqueueBotOutbound({ type: 'move', metaGame, gameid, botId: id });
    }
  }
}
