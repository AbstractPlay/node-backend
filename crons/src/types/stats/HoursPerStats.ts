export type HoursPerStats = {
    /** Move-weighted mean of winsorized per-game hours-per-move rates */
    mean: number;
    /** Median of winsorized per-game hours-per-move rates */
    median: number;
    /** Number of qualifying games */
    n: number;
    /** Median winsorized hours per move per week bucket (aligned with histograms.all) */
    byWeek: number[];
};
