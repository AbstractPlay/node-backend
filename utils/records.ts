'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory } from '@abstractplay/gameslib';
import { APGameRecord } from '@abstractplay/recranks';
import { gunzipSync, strFromU8 } from "fflate";
import { loadAll } from "ion-js";

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
    metaGame: string;
    state: string;
    players: {
        name: string;
        id: string;
        time: number;
    }[];
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
                const parsed = loadAll(ion);
                for (const outerRec of parsed) {
                    const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                    const rec = json.Item;
                    if ( (rec.pk === "GAME") && (rec.sk.includes("#1#")) ) {
                        justGames.push(rec as GameRec);
                    }
                }
            }
          } catch (err) {
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
    const allRecs: APGameRecord[] = [];
    const metaRecs = new Map<string, APGameRecord[]>();
    const userRecs = new Map<string, APGameRecord[]>();
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        const rec = g.genRecord({
            uid: gdata.id,
            players: gdata.players.map(p => { return {uid: p.id, name: p.name}; }),
        });
        if (rec === undefined) {
            throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        allRecs.push(rec);
        pushToMap(metaRecs, gdata.metaGame, rec);
        for (const p of gdata.players) {
            pushToMap(userRecs, p.id, rec);
        }
    }
    console.log(`allRecs: ${allRecs.length}, metaRecs: ${[...metaRecs.keys()].length}, userRecs: ${[...userRecs.keys()].length}`);

    // write files to S3
    const bodyAll = JSON.stringify(allRecs);
    let cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: "ALL.json",
        Body: bodyAll,
    });
    let response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("All records done");
    // meta games
    for (const [meta, recs] of metaRecs.entries()) {
        cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `meta/${meta}.json`,
            Body: JSON.stringify(recs),
        });
        response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Meta games done");
    // players
    for (const [player, recs] of userRecs.entries()) {
        cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `player/${player}.json`,
            Body: JSON.stringify(recs),
        });
        response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Player recs done");
};
