export type Tournament = {
    pk: string;
    sk: string;
    id: string;
    metaGame: string;
    variants: string[];
    number: number;
    started: boolean;
    dateCreated: number;
    datePreviousEnded: number; // 0 means either the first tournament or a restart of the series (after it stopped because not enough participants), 3000000000000 means previous tournament still running.
    [key: string]: any;
};
