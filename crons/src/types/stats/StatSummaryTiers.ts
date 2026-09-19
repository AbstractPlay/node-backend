import type { UserGameRating, UserRating, UserNumber, UserNumList, GameNumber, GameNumList } from "./index.js";
import type { GlickoByGameRow, GlickoSiteEntry, GlickoMeta } from "./GlickoStats.js";
import type { PlayerTimeoutStats } from "./PlayerTimeoutStats.js";
import type { SoloMetaStats, SoloSeedBoard } from "./SoloStats.js";
import type {
    TwoPlayerStats,
    GeoStats,
    HoursPerStats,
    PlayContextStats,
    MetaPieStats,
    MetaPlayerCountMix,
    AnonymizedRivalry,
    SeasonalityStats,
} from "./index.js";

export type StatSummarySite = {
    generated: string;
    tier: "site";
    numGames: number;
    numPlayers: number;
    oldestRec?: string;
    newestRec?: string;
    timeoutRate: number;
    abandonedRate: number;
    playContext: PlayContextStats;
    pieRates: MetaPieStats[];
    playerCountMix: MetaPlayerCountMix[];
    geoStats: GeoStats[];
    activeGeoStats: GeoStats[];
    seasonality: SeasonalityStats;
    rivalries: AnonymizedRivalry[];
    hoursPer: HoursPerStats;
    recent: GameNumber[];
    histograms: {
        all: number[];
        allPlayers: number[];
        activeMovers: number[];
        returningPlayers: number[];
        firstTimers: number[];
        timeouts: number[];
        abandoned: number[];
        meta: GameNumList[];
    };
    hMeta: UserNumber[];
    metaStats: {
        [k: string]: TwoPlayerStats;
    };
    soloMetaStats: {
        [k: string]: SoloMetaStats;
    };
    soloSeedBoards: SoloSeedBoard[];
    plays: {
        total: GameNumber[];
        width: GameNumber[];
    };
    topPlayers: UserGameRating[];
};

export type StatSummaryPlayers = {
    generated: string;
    tier: "players";
    players: {
        social: UserNumber[];
        eclectic: UserNumber[];
        allPlays: UserNumber[];
        h: UserNumber[];
        hOpp: UserNumber[];
        timeoutStats: PlayerTimeoutStats[];
    };
    histograms: {
        players: UserNumList[];
        playerTimeouts: UserNumList[];
    };
    pastDisplayNames?: {
        user: string;
        names: string[];
    }[];
};

export type StatSummaryRatings = {
    generated: string;
    tier: "ratings";
    ratings: {
        highest: UserGameRating[];
        avg: UserRating[];
        weighted: UserRating[];
        glickoByGame: GlickoByGameRow[];
        glickoSite: GlickoSiteEntry[];
        glickoMeta: GlickoMeta;
        playerCountsByUid: Record<string, number>;
    };
};

export type PlayerSummarySlice = {
    generated: string;
    user: string;
    pastDisplayNames?: string[];
    players: {
        allPlays?: number;
        eclectic?: number;
        social?: number;
        h?: number;
        hOpp?: number;
        timeoutCount?: number;
        latestTimeoutMs?: number;
    };
    histograms: {
        players?: number[];
        playerTimeouts?: number[];
    };
    ratings: {
        highest: UserGameRating[];
        glickoByGame?: GlickoByGameRow[];
        glickoSite?: GlickoSiteEntry;
        avg?: number;
        weighted?: number;
    };
};
