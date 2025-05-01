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

type Entry = {
    metaGame: string;
    score: number;
};

type SummaryRec = {
    raw30: Entry[];
    raw60: Entry[];
    raw90: Entry[];
    norm30: Entry[];
    norm60: Entry[];
    norm90: Entry[];
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

    const cutoff30 = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const cutoff60 = Date.now() - (60 * 24 * 60 * 60 * 1000);
    const cutoff90 = Date.now() - (90 * 24 * 60 * 60 * 1000);

    const mvTimes30: MoveRec[] = [];
    const mvTimes60: MoveRec[] = [];
    const mvTimes90: MoveRec[] = [];
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // build rec and store
        for (let i = 1; i < g.stack.length; i++) {
            const metaGame = gdata.metaGame;
            const time = new Date(g.stack[i]._timestamp).getTime();
            if (time < cutoff90) {
                continue;
            }
            const pidx = (i - 1) % g.numplayers;
            const player = gdata.players[pidx].id;
            const rec = {
                metaGame,
                player,
                time,
            };
            mvTimes90.push(rec);
            if (time >= cutoff60) {
                mvTimes60.push(rec);
            }
            if (time >= cutoff30) {
                mvTimes30.push(rec);
            }
        }
    }
    console.log(`num mv records: ${mvTimes90.length}`);

    // assemble raw scores
    const raw30: Entry[] = [];
    const raw60: Entry[] = [];
    const raw90: Entry[] = [];

    for (const num of [30, 60, 90]) {
        const lst: MoveRec[] = num === 30 ? mvTimes30 : num === 60 ? mvTimes60 : mvTimes90;
        const metas = new Set<string>(lst.map(({metaGame}) => metaGame));
        for (const meta of metas) {
            const score = lst.filter(({metaGame}) => metaGame === meta).length;
            const rec: Entry = {
                metaGame: meta,
                score,
            };
            if (num === 30) {
                raw30.push(rec);
            } else if (num === 60) {
                raw60.push(rec);
            } else {
                raw90.push(rec);
            }
        }
    }

    // assemble normalized scores
    const norm30: Entry[] = [];
    const norm60: Entry[] = [];
    const norm90: Entry[] = [];

    for (const num of [30, 60, 90]) {
        const lst: MoveRec[] = num === 30 ? mvTimes30 : num === 60 ? mvTimes60 : mvTimes90;
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
            let score = 0;
            for (let i = 0; i <= maxBucket; i++) {
                const tranche = bucketed.filter(({bucket}) => bucket === i);
                const players = new Set<string>(tranche.map(({rec}) => rec.player));
                for (const player of players) {
                    const numRecs = tranche.filter(({rec}) => rec.player === player).length;
                    let inc = 1;
                    for (let j = 0; j < numRecs; j++) {
                        score += inc;
                        inc *= 0.75;
                    }
                }
            }

            const rec: Entry = {
                metaGame: meta,
                score,
            };
            if (num === 30) {
                norm30.push(rec);
            } else if (num === 60) {
                norm60.push(rec);
            } else {
                norm90.push(rec);
            }
        }
    }

    const final: SummaryRec = {
        raw30,
        raw60,
        raw90,
        norm30,
        norm60,
        norm90,
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
