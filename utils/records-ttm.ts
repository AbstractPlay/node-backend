'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory } from '@abstractplay/gameslib';
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";

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
        console.log(`Loading ${file.Key}`);
        const command = new GetObjectCommand({
            Bucket: DUMP_BUCKET,
            Key: file.Key,
          });

          try {
            const response = await s3.send(command);
            // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
            const bytes = await response.Body?.transformToByteArray();
            if (bytes !== undefined) {
                const ion = gunzipSync(bytes);
                console.log(`Processing ${ion.length} bytes`);
                let sofar = "";
                let ptr = 0;
                const chunk = 100000;
                while (ptr < ion.length) {
                    sofar += strFromU8(ion.slice(ptr, ptr + chunk));
                    while (sofar.includes("\n")) {
                        const idx = sofar.indexOf("\n");
                        const line = sofar.substring(0, idx);
                        sofar = sofar.substring(idx+1);
                        try {
                            const outerRec = loadIon(line);
                            if (outerRec === null) {
                                console.log(`Could not load ION record, usually because of an empty line.\nOffending line: "${line}"`)
                            } else {
                                const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                                const rec = json.Item;
                                if ( (rec.pk === "GAME") && (rec.sk.includes("#1#")) ) {
                                    justGames.push(rec as GameRec);
                                }
                            }
                        } catch (err) {
                            console.log(`An error occurred while loading an ION record: ${line}`);
                            console.error(err);
                        }
                    }
                }
                ptr += chunk;
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`Found ${justGames.length} completed GAME records`);

    // for each game, generate a game record and categorize it
    const pushToMap = (m: Map<string, any[]>, key: string, value: any) => {
        if (m.has(key)) {
            const current = m.get(key)!;
            m.set(key, [...current, value]);
        } else {
            m.set(key, [value]);
        }
    }
    const ttm = new Map<string, number[]>();
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // calculate response rates
        const times: number[] = [];
        for (let i = 0; i < g.stack.length - 1; i++) {
            const t1 = new Date(g.stack[i]._timestamp).getTime();
            const t2 = new Date(g.stack[i+1]._timestamp).getTime();
            times.push(t2 - t1);
        }
        times.forEach((t, i) => pushToMap(ttm, gdata.players[i % g.numplayers].id, t));
    }
    console.log(`ttm: ${ttm.size}`);

    // write files to S3
    // response times
    for (const [player, lst] of ttm.entries()) {
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `ttm/${player}.json`,
            Body: JSON.stringify(lst),
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Response times done");

    console.log("ALL DONE");
};
