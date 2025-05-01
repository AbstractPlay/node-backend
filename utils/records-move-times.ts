'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory } from '@abstractplay/gameslib';
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

type MoveRec = {
    metaGame: string;
    player: string;
    time: number;
};

export const handler: Handler = async (event: any, context?: any) => {
    // scan bucket for data folder
    const command = new ListObjectsV2Command({
        Bucket: DUMP_BUCKET,
    });

    const allContents: _Object[] = [];
    try {
        let isTruncatedOuter = true;

        while (isTruncatedOuter) {
            const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } =
            await s3.send(command);
            if (Contents === undefined) {
            throw new Error(`Could not list the bucket contents`);
            }
            allContents.push(...Contents);
            isTruncatedOuter = IsTruncatedInner || false;
            command.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
    }

    // find the latest `manifest-summary.json` file
    const manifests = allContents.filter(c => c.Key?.includes("manifest-summary.json"));
    manifests.sort((a, b) => b.LastModified!.toISOString().localeCompare(a.LastModified!.toISOString()));
    const latest = manifests[0];
    const match = latest.Key!.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
    if (match === null) {
        throw new Error(`Could not extract uid from "${latest.Key}"`);
    }
    // from there, extract the UID and list of associated data files
    const uid = match[1];
    const dataFiles = allContents.filter(c => c.Key?.includes(`${uid}/data/`) && c.Key?.endsWith(".ion.gz"));
    console.log(`Found the following matching data files:\n${JSON.stringify(dataFiles, null, 2)}`);

    // load the data from each data file, but only keep the GAME records
    const justGames: GameRec[] = [];
    for (const file of dataFiles) {
        const command = new GetObjectCommand({
            Bucket: DUMP_BUCKET,
            Key: file.Key,
          });

          try {
            const response = await s3.send(command);
            // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
            const bytes = await response.Body?.transformToByteArray();
            if (bytes !== undefined) {
                const ion = strFromU8(gunzipSync(bytes));
                for (const line of ion.split("\n")) {
                    const outerRec = load(line);
                    if (outerRec === null) {
                        console.log(`Could not load ION record, usually because of an empty line.\nOffending line: "${line}"`)
                    } else {
                        const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                        const rec = json.Item;
                        if (rec.pk === "GAME") {
                            justGames.push(rec as GameRec);
                        }
                    }
                }
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`Found ${justGames.length} GAME records (active and completed)`);

    // we're going to ignore records older than six months (180 days) to start
    const cutoff = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);

    const mvTimes: MoveRec[] = [];
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // build rec and store
        for (let i = 1; i < g.stack.length; i++) {
            const metaGame = gdata.metaGame;
            const time = new Date(g.stack[i]._timestamp).getTime();
            if (time < cutoff) {
                continue;
            }
            const pidx = (i - 1) % g.numplayers;
            const player = gdata.players[pidx].id;
            mvTimes.push({
                metaGame,
                player,
                time,
            });
        }
    }
    console.log(`num mv records: ${mvTimes.length}`);

    // write files to S3
    // response times
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `mvtimes.json`,
        Body: JSON.stringify(mvTimes),
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Move times done");

    console.log("ALL DONE");
};
