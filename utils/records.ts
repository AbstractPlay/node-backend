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
    const tournaments: Tournament[] = [];
    const events: OrgEvent[] = [];
    const eventGames: OrgEventGame[] = [];
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
                        if ( (rec.pk === "GAME") && (rec.sk.includes("#1#")) ) {
                            justGames.push(rec as GameRec);
                        } else if (rec.pk === "TOURNAMENT" || rec.pk === "COMPLETEDTOURNAMENT") {
                            tournaments.push(rec as Tournament);
                        } else if (rec.pk === "ORGEVENT") {
                            events.push(rec as OrgEvent);
                        } else if (rec.pk === "ORGEVENTGAME") {
                            eventGames.push(rec as OrgEventGame);
                        }
                    }
                }
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
    const allRecs: APGameRecord[] = [];
    const metaRecs = new Map<string, APGameRecord[]>();
    const userRecs = new Map<string, APGameRecord[]>();
    const eventRecs = new Map<string, APGameRecord[]>();
    const ttm = new Map<string, number[]>();
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        let event: string|null = null;
        let round: string|null = null;
        if (gdata.tournament !== undefined) {
            const trec = tournaments.find(t => t.id === gdata.tournament);
            if (trec !== undefined) {
                event = `Automated Tournament #${trec.number} (${trec.sk})`
                round = "1";
            } else {
                console.log(`Could not find a matching tournament record for game record "${gdata.sk}".`);
            }
        } else if (gdata.event !== undefined) {
            const erec = events.find(e => e.sk === gdata.event);
            const egrec = eventGames.find(eg => eg.sk === [gdata.event, gdata.id].join("#"));
            if (erec !== undefined && egrec !== undefined) {
                event = erec.name;
                round = egrec.round.toString();
            } else {
                console.log(`Could not find a matching event records for game record "${gdata.sk}".`)
            }
        }
        const rec = g.genRecord({
            uid: gdata.id,
            players: gdata.players.map(p => { return {uid: p.id, name: p.name}; }),
            event: event !== null ? event : undefined,
            round: round !== null ? round : undefined,
        });
        if (rec === undefined) {
            throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // check for pie
        if ( (gdata.pieInvoked !== undefined) && (gdata.pieInvoked) ) {
            rec.header.pied = true;
        }
        allRecs.push(rec);
        pushToMap(metaRecs, gdata.metaGame, rec);
        for (const p of gdata.players) {
            pushToMap(userRecs, p.id, rec);
        }
        if (event !== null) {
            let id: string|undefined;
            if (gdata.tournament !== undefined) {
                id = gdata.tournament;
            } else if (gdata.event !== undefined) {
                id = gdata.event;
            }
            if (id !== undefined) {
                pushToMap(eventRecs, id, rec);
            }
        }
        // calculate response rates
        const times: number[] = [];
        for (let i = 0; i < g.stack.length - 1; i++) {
            const t1 = new Date(g.stack[i]._timestamp).getTime();
            const t2 = new Date(g.stack[i+1]._timestamp).getTime();
            times.push(t2 - t1);
        }
        const interim = new Map<string, number[]>();
        times.forEach((t, i) => pushToMap(interim, gdata.players[i % g.numplayers].id, t));
        for (const [player, lst] of interim.entries()) {
            if (lst.length > 0) {
                const avg = lst.reduce((a, b) => a + b, 0) / lst.length;
                pushToMap(ttm, player, avg);
            }
        }
    }
    console.log(`allRecs: ${allRecs.length}, metaRecs: ${[...metaRecs.keys()].length}, userRecs: ${[...userRecs.keys()].length}, eventRecs: ${[...eventRecs.keys()].length}`);

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
    // response times
    for (const [player, lst] of ttm.entries()) {
        cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `ttm/${player}.json`,
            Body: JSON.stringify(lst),
        });
        response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Response times done");
    // events
    for (const [eventid, recs] of eventRecs.entries()) {
        cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `event/${eventid}.json`,
            Body: JSON.stringify(recs),
        });
        response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Event recs done");

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
            command.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
    }
    cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `_manifest.json`,
        Body: JSON.stringify(recList),
    });
    response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Manifest generated");

    console.log("ALL DONE");
};
