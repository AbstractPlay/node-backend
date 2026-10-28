export type ArenaClockSnapshot = {
    startSec: number;
    incSec: number;
    maxSec: number;
};

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
    ladderId?: string;
    variants?: string[];
    playMode?: 'arena' | 'correspondence' | string;
    arenaTcId?: string;
    arenaClock?: ArenaClockSnapshot;
    [key: string]: any;
}
