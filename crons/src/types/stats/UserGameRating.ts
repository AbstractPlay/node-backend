import type { GlickoStats } from "./GlickoStats.js";
import type { UserRating } from "./UserRating.js";;
export interface UserGameRating extends UserRating {
    game: string;
    wld: [number,number,number];
    glicko?: GlickoStats;
    trueskill?: {mu: number; sigma: number};
}
