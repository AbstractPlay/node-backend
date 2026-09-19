export type GameRec = {
    pk: string;
    sk: string;
    id: string;
    metaGame: string;
    state: string;
    pieInvoked?: boolean;
    rated?: boolean;
    players: {
        name: string;
        id: string;
        time: number;
    }[];
    tournament?: string;
    event?: string;
    [key: string]: any;
}
