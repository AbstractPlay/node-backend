export interface GlickoStats {
    rating: number;
    rd: number;
    volatility: number;
    ratingLow: number;
    ratingHigh: number;
    provisional: boolean;
    established: boolean;
    n: number;
}

export type GlickoByGameRow = {
    user: string;
    game: string;
    glicko: GlickoStats;
};

export type GlickoSiteEntry = {
    user: string;
    rating: number;
    rd: number;
    ratingLow: number;
    ratingHigh: number;
    n: number;
    provisional: boolean;
    established: boolean;
};

export type GlickoGameCounts = {
    game: string;
    rated: number;
    provisional: number;
    established: number;
};

export type GlickoSiteCounts = {
    rated: number;
    provisional: number;
    established: number;
};

export type GlickoMeta = {
    establishedRd: number;
    provisionalRd: number;
    minGamesEstablished: number;
    minGamesProvisional: number;
    periodMs: number;
    generatedAt: string;
    counts: {
        byGame: GlickoGameCounts[];
        site: GlickoSiteCounts;
    };
};
