export type OrgEventGame = {
    pk: "ORGEVENTGAME";
    sk: string;             // <eventid>#<gameid>
    metaGame: string;
    variants?: string[];
    round: number;
    gameid: string;
    player1: string;
    player2: string;
    winner?: number[];
    arbitrated?: boolean;
};
