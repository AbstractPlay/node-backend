'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory } from '@abstractplay/gameslib';
import { type APGameRecord } from '@abstractplay/recranks';
import { gunzipSync, strFromU8 } from "fflate";
import { load } from "ion-js";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const DUMP_BUCKET = "abstractplay-db-dump";
const REC_BUCKET = "records.abstractplay.com";

type BasicRec = {
    Item: {
        pk: string;
        sk: string;
        [key: string]: any;
    }
}

type GameRec = {
    pk: string;
    sk: string;
    id: string;
    metaGame: string;
    state: string;
    pieInvoked?: boolean;
    players: {
        name: string;
        id: string;
        time: number;
    }[];
    tournament?: string;
    event?: string;
    [key: string]: any;
}

type Tournament = {
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

type OrgEvent = {
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

type OrgEventGame = {
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

export const handler: Handler = async (event: any, context?: any) => {
    // generate file listing
    const recListCmd = new ListObjectsV2Command({
        Bucket: REC_BUCKET,
    });

    const recList: _Object[] = [];
    try {
        let isTruncatedOuter = true;

        while (isTruncatedOuter) {
            const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } =
            await s3.send(recListCmd);
            if (Contents === undefined) {
                throw new Error(`Could not list the bucket contents`);
            }
            recList.push(...Contents);
            isTruncatedOuter = IsTruncatedInner || false;
            recListCmd.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
    }
    console.log(JSON.stringify(recList));
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `_manifest.json`,
        Body: JSON.stringify(recList),
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Manifest generated");

    console.log("ALL DONE");
};
