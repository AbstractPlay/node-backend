import type { ClientBot } from './participants';
import type { GameMarkSummary, HighlightEntry, RepresentativeEntry } from './playerGameMarks';
import type { ActiveGameKey } from './dashboardGames';
import type { DashboardGame } from './dashboardGames';

import type { ClientNotification } from './notifications';

export type MeAncillaryData = {
  tags: unknown[];
  palettes: unknown[];
  realStanding: unknown[];
  customizations: Record<string, unknown>;
  bots: ClientBot[];
  blocked: string[];
  watchedGames: GameMarkSummary[];
  highlights: HighlightEntry[];
  representatives: RepresentativeEntry[];
};

export type MeChallengeData = {
  challengesIssued: unknown[];
  challengesReceived: unknown[];
  challengesAccepted: unknown[];
  standingChallenges: unknown[];
};

export type MeProfilePayload = {
  id: string;
  name: string;
  admin: boolean;
  organizer: boolean;
  language: string;
  country: string;
  settings: unknown;
  stars: string[];
  bggid?: string;
  about?: string;
  mayPush: boolean;
  publicRivalries: boolean;
  activeGames: ActiveGameKey[];
  bots: ClientBot[];
  tags: unknown[];
  palettes: unknown[];
  realStanding: unknown[];
  customizations: MeAncillaryData['customizations'];
  blocked: string[];
  watchedGames: GameMarkSummary[];
  highlights: HighlightEntry[];
  representatives: RepresentativeEntry[];
};

export type MeDashboardPayload = Omit<MeProfilePayload, 'activeGames'> & MeChallengeData & {
  games: DashboardGame[];
  notifications: ClientNotification[];
};

type MeUserFields = {
  id: string;
  name: string;
  admin?: boolean;
  organizer?: boolean;
  language: string;
  country: string;
  settings: unknown;
  stars?: string[];
  bggid?: string;
  about?: string;
  mayPush?: boolean;
  publicRivalries?: boolean;
};

export function buildMeProfilePayload(
  user: MeUserFields,
  ancillary: MeAncillaryData,
  activeGames: ActiveGameKey[],
): MeProfilePayload {
  return {
    id: user.id,
    name: user.name,
    admin: user.admin === true,
    organizer: user.organizer === true,
    language: user.language,
    country: user.country,
    settings: user.settings,
    stars: user.stars ?? [],
    bggid: user.bggid,
    about: user.about,
    mayPush: user.mayPush === true,
    publicRivalries: user.publicRivalries === true,
    activeGames,
    bots: ancillary.bots,
    tags: ancillary.tags,
    palettes: ancillary.palettes,
    realStanding: ancillary.realStanding,
    customizations: ancillary.customizations,
    blocked: ancillary.blocked,
    watchedGames: ancillary.watchedGames,
    highlights: ancillary.highlights,
    representatives: ancillary.representatives,
  };
}

export function buildMeDashboardPayload(
  user: MeUserFields,
  ancillary: MeAncillaryData,
  games: DashboardGame[],
  challenges: MeChallengeData,
  notifications: ClientNotification[] = [],
): MeDashboardPayload {
  const profile = buildMeProfilePayload(user, ancillary, []);
  const { activeGames: _activeGames, ...profileWithoutActive } = profile;
  return {
    ...profileWithoutActive,
    games,
    notifications,
    ...challenges,
  };
}
