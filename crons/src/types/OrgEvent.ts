export type OrgEvent = {
    pk: "ORGEVENT";
    sk: string;             // <eventid>
    name: string;
    description: string;
    organizer: string;
    dateStart: number;
    dateEnd?: number;
    winner?: string[];
    visible: boolean;
}
