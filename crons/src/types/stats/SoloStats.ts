export type SoloOutcomeType = "binary" | "graded" | "score" | "timed";
export type ScoreDirection = "higher" | "lower";

/** Per meta game + variant combo (all seeds combined). */
export type SoloMetaStats = {
    game: string;
    metaUid: string;
    variants: string[];
    attempts: number;
    uniquePlayers: number;
    repeatAttemptRate: number;
    outcomeTypes: Partial<Record<SoloOutcomeType, number>>;
    scoreMedianAllAttempts?: number;
    scoreMedianBestPerUser?: number;
    scoreP90BestPerUser?: number;
    passRateAllAttempts?: number;
    passRateBestPerUser?: number;
    gradeHistogramBestPerUser?: Record<string, number>;
    moveCountMedian?: number;
};

export type SoloSeedBoardRow = {
    userid: string;
    name: string;
    score: number;
    grade?: string;
    passed?: boolean;
    dateEnd: string;
    attempts: number;
};

/** Per meta game + variant + challenge-seed leaderboard. */
export type SoloSeedBoard = {
    game: string;
    metaUid: string;
    variants: string[];
    challengeSeed: string;
    scoreDirection: ScoreDirection;
    outcomeType?: SoloOutcomeType;
    attempts: number;
    uniquePlayers: number;
    scoreMedianAllAttempts?: number;
    scoreMedianBestPerUser?: number;
    rows: SoloSeedBoardRow[];
};
