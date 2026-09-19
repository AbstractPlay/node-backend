import i18n from 'i18next';
import { gameinfo } from '@abstractplay/gameslib';

/** Localized meta-game title for the active i18next language (email copy). */
export function localizedGameName(metaUid: string): string {
  const key = `names.${metaUid}`;
  if (i18n.exists(`apgames:${key}`)) {
    return i18n.t(`apgames:${key}`);
  }
  return gameinfo.get(metaUid)?.name ?? metaUid;
}
