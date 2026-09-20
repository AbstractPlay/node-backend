import { isCatalogVisible } from '@abstractplay/gameslib';

function catalogProductionMode(): boolean {
  return process.env.WEBSOCKET_STAGE === 'prod';
}

/** Whether new play, challenges, and catalog listings may use this meta UID on the current stage. */
export function isMetaGamePlayableOnStage(metaUid: string): boolean {
  return isCatalogVisible(metaUid, catalogProductionMode());
}
