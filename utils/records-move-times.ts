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

type MoveRec = {
    metaGame: string;
    player: string;
    time: number;
};

type Entry = {
    metaGame: string;
    score: number;
};

type SummaryRec = {
    raw1w: Entry[];
    raw1m: Entry[];
    raw6m: Entry[];
    raw1y: Entry[];
    players1w: Entry[];
    players1m: Entry[];
    players6m: Entry[];
    players1y: Entry[];
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
                const chunk = 1000000;
                while (ptr < ion.length) {
                    sofar += strFromU8(ion.slice(ptr, ptr + chunk));
                    while (sofar.includes("}}\n")) {
                        const idx = sofar.indexOf("}}\n");
                        const line = sofar.substring(0, idx+2);
                        sofar = sofar.substring(idx+3);
                        try {
                            const outerRec = loadIon(line);
                            if (outerRec === null) {
                                console.log(`Could not load ION record, usually because of an empty line.\nOffending line: "${line}"`)
                            } else {
                                const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                                const rec = json.Item;
                                if (rec.pk === "GAME") {
                                    justGames.push(rec as GameRec);
                                }
                            }
                        } catch (err) {
                            console.log(`An error occurred while loading an ION record: ${line}`);
                            console.error(err);
                        }
                    }
                    ptr += chunk;
                }
            } else {
                throw new Error(`Could not load bytes from file ${file.Key}`);
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`Found ${justGames.length} GAME records (active and completed)`);

    const cutoff1w = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const cutoff1m = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const cutoff6m = Date.now() - (180 * 24 * 60 * 60 * 1000);
    const cutoff1y = Date.now() - (365 * 24 * 60 * 60 * 1000);

    const mvTimes1w: MoveRec[] = [];
    const mvTimes1m: MoveRec[] = [];
    const mvTimes6m: MoveRec[] = [];
    const mvTimes1y: MoveRec[] = [];
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // build rec and store
        for (let i = 1; i < g.stack.length; i++) {
            const metaGame = gdata.metaGame;
            const time = new Date(g.stack[i]._timestamp).getTime();
            if (time < cutoff1y) {
                continue;
            }
            const pidx = (i - 1) % g.numplayers;
            const player = gdata.players[pidx].id;
            const rec = {
                metaGame,
                player,
                time,
            };
            mvTimes1y.push(rec);
            if (time >= cutoff6m) {
                mvTimes6m.push(rec);
            }
            if (time >= cutoff1m) {
                mvTimes1m.push(rec);
            }
            if (time >= cutoff1w) {
                mvTimes1w.push(rec);
            }
        }
    }
    console.log(`num mv records: ${mvTimes1y.length}`);

    // assemble raw scores
    const raw1w: Entry[] = [];
    const raw1m: Entry[] = [];
    const raw6m: Entry[] = [];
    const raw1y: Entry[] = [];

    for (const num of [7, 30, 180, 365]) {
        const lst: MoveRec[] = num === 7 ? mvTimes1w : num === 30 ? mvTimes1m : num === 180 ? mvTimes6m : mvTimes1y;
        const metas = new Set<string>(lst.map(({metaGame}) => metaGame));
        for (const meta of metas) {
            const score = lst.filter(({metaGame}) => metaGame === meta).length;
            const rec: Entry = {
                metaGame: meta,
                score,
            };
            if (num === 7) {
                raw1w.push(rec);
            } else if (num === 30) {
                raw1m.push(rec);
            } else if (num === 180) {
                raw6m.push(rec);
            } else {
                raw1y.push(rec);
            }
        }
    }

    // assemble players scores
    const players1w: Entry[] = [];
    const players1m: Entry[] = [];
    const players6m: Entry[] = [];
    const players1y: Entry[] = [];

    for (const num of [7, 30, 180, 365]) {
        const lst: MoveRec[] = num === 7 ? mvTimes1w : num === 30 ? mvTimes1m : num === 180 ? mvTimes6m : mvTimes1y;
        const metas = new Set<string>(lst.map(({metaGame}) => metaGame));
        for (const meta of metas) {
            const recs = lst.filter(({metaGame}) => metaGame === meta);
            const minTime = Math.min(...recs.map(({time}) => time));
            const bucketed: {rec: MoveRec, bucket: number}[] = [];
            for (const rec of recs) {
                const timeSince = (rec.time - minTime);
                const bucket = Math.floor(timeSince / (24 * 60 * 60 * 1000));
                bucketed.push({
                    rec,
                    bucket,
                });
            }
            const maxBucket = Math.max(...bucketed.map(({bucket}) => bucket));
            // players
            let score = 0;
            for (let i = 0; i <= maxBucket; i++) {
                const tranche = bucketed.filter(({bucket}) => bucket === i);
                const players = new Set<string>(tranche.map(({rec}) => rec.player));
                score += players.size;
            }

            const rec: Entry = {
                metaGame: meta,
                score,
            };
            if (num === 7) {
                players1w.push(rec);
            } else if (num === 30) {
                players1m.push(rec);
            } else if (num === 180) {
                players6m.push(rec);
            } else {
                players1y.push(rec);
            }
        }
    }

    const final: SummaryRec = {
        raw1w,
        raw1m,
        raw6m,
        raw1y,
        players1w,
        players1m,
        players6m,
        players1y,
    };

    // write files to S3
    // response times
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `mvtimes.json`,
        Body: JSON.stringify(final),
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Move times done");

    console.log("ALL DONE");
};
