import type { ClientBot } from './participants.js';
import type { GameMarkSummary, HighlightEntry, RepresentativeEntry } from './playerGameMarks.js';
import type { ActiveGameKey } from './dashboardGames.js';
import type { DashboardGame } from './dashboardGames.js';
import type { VacationSnapshot } from './vacation/types.js';

import { stripColorFromSettings } from './stripLegacyColorSettings.js';

export type MeAncillaryData = {
  tags: unknown[];
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
  realStanding: unknown[];
  customizations: MeAncillaryData['customizations'];
  blocked: string[];
  watchedGames: GameMarkSummary[];
  highlights: HighlightEntry[];
  representatives: RepresentativeEntry[];
  vacation: VacationSnapshot;
};

export type MeDashboardPayload = Omit<MeProfilePayload, 'activeGames'> & MeChallengeData & {
  games: DashboardGame[];
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
  vacation: VacationSnapshot,
): MeProfilePayload {
  return {
    id: user.id,
    name: user.name,
    admin: user.admin === true,
    organizer: user.organizer === true,
    language: user.language,
    country: user.country,
    settings: stripColorFromSettings(
      user.settings as Record<string, unknown> | null | undefined,
    ),
    stars: user.stars ?? [],
    bggid: user.bggid,
    about: user.about,
    mayPush: user.mayPush === true,
    publicRivalries: user.publicRivalries === true,
    activeGames,
    bots: ancillary.bots,
    tags: ancillary.tags,
    realStanding: ancillary.realStanding,
    customizations: ancillary.customizations,
    blocked: ancillary.blocked,
    watchedGames: ancillary.watchedGames,
    highlights: ancillary.highlights,
    representatives: ancillary.representatives,
    vacation,
  };
}

export function buildMeDashboardPayload(
  user: MeUserFields,
  ancillary: MeAncillaryData,
  games: DashboardGame[],
  challenges: MeChallengeData,
  vacation: VacationSnapshot,
): MeDashboardPayload {
  const profile = buildMeProfilePayload(user, ancillary, [], vacation);
  const { activeGames: _activeGames, ...profileWithoutActive } = profile;
  return {
    ...profileWithoutActive,
    games,
    ...challenges,
  };
}
