export type RivalryPair = {
    userA: string;
    userB: string;
    n: number;
};

/** Private ops rivalry entry — includes user IDs and display names. */
export type IdentifiedRivalryPair = {
    userA: string;
    nameA: string;
    userB: string;
    nameB: string;
    n: number;
};

export type RivalriesFull = {
    generated: string;
    minGames: number;
    pairs: IdentifiedRivalryPair[];
};

export type AnonymizedRivalry = {
    rank: number;
    label: string;
    n: number;
    players?: {
        id: string;
        name: string;
    }[];
};
