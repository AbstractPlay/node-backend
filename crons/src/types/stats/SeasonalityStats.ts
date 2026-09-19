/** Move-time activity in UTC (from records-move-times). `movesByDow` / `playersByDow` index 0 = Sunday. */
export type SeasonalityStats = {
    movesByDow: number[];
    playersByDow: number[];
    movesByHour: number[];
    /** Rolling window in days used to compute these bins (typically 365). */
    windowDays: number;
};
