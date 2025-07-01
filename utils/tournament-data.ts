'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deepclone = require("rfdc/default");

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

type Division = {
  numGames: number;
  numCompleted: number;
  processed: boolean;
  winnerid?: string;
  winner?: string;
};

type TournamentPlayer = {
  pk: string;
  sk: string;
  playerid: string;
  playername: string;
  once?: boolean;
  division?: number;
  score?: number;
  tiebreak?: number;
  rating?: number;
  timeout?: boolean;
};

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
  nextid?: string;
  dateStarted?: number;
  dateEnded?: number;
  divisions?: {
    [division: number]: Division;
  };
  players?: TournamentPlayer[]; // only on archived tournaments
  waiting?: boolean; // tournament does not yet have 4 players
};

type ResultsNode = {
    pid: string;
    tid: string;
    metaGame: string;
    won: boolean;
    t50: boolean;
    score: number;
};

type TournamentNode = {
    pid: string;
    tid: string;
    metaGame: string;
    place: number;
    participants: number;
    score: number;
};

type SummaryNode = {
    player: string;
    count: number;
    won: number;
    t50: number;
    scoreSum: number;
    scoreAvg: number;
    scoreMed: number;
};

type Summary = SummaryNode[];

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

    // load the data from each data file, but only keep the COMPLETEDTOURNAMENT records
    const tourneys: Tournament[] = [];
    let possPlayers: TournamentPlayer[]|undefined = [];
    let possTourneys: Tournament[]|undefined = [];
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
                                if (rec.pk === "COMPLETEDTOURNAMENT") {
                                    tourneys.push(rec as Tournament);
                                } else if (rec.pk === "TOURNAMENT" && (rec as Tournament).dateEnded !== undefined) {
                                    possTourneys.push(rec as Tournament);
                                } else if (rec.pk === "TOURNAMENTPLAYER") {
                                    possPlayers.push(rec as TournamentPlayer);
                                }
                            }
                        } catch (err) {
                            console.log(`An error occurred while loading an ION record: ${line}`);
                            console.error(err);
                        }
                    }
                    ptr += chunk;
                }
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`Found ${tourneys.length} COMPLETEDTOURNAMENT records`);

    // for each possTourney, merge matching players, and add to overall tourneys list
    for (const tourney of possTourneys) {
        const players = possPlayers.filter(rec => rec.sk.startsWith(tourney.id));
        const newrec = deepclone(tourney) as Tournament;
        newrec.players = players;
        tourneys.push(newrec);
    }
    possTourneys = undefined;
    possPlayers = undefined;

    // for each tournament, tabulate results
    const pushToMap = (m: Map<string, any[]>, key: string, value: any) => {
        if (m.has(key)) {
            const current = m.get(key)!;
            m.set(key, [...current, value]);
        } else {
            m.set(key, [value]);
        }
    }
    const sortPlayers = (a: TournamentPlayer, b: TournamentPlayer): number => {
        if (a.score === b.score) {
            if (a.tiebreak === b.tiebreak) {
                return b.rating! - a.rating!;
            } else {
                return b.tiebreak! - a.tiebreak!;
            }
        } else {
            return b.score! - a.score!;
        }
    }

    const summary = new Map<string, ResultsNode[]>();
    const individual = new Map<string, TournamentNode[]>();
    for (const tourney of tourneys) {
        for (const [nstr, division] of Object.entries(tourney.divisions!)) {
            const num = parseInt(nstr, 10);
            const players = tourney.players!.filter(p => p.division === num);
            players.sort(sortPlayers);
            if (players[0].playerid !== division.winnerid) {
                console.log(`Tournament winners differed for division ${nstr}:\nSorted says ${players[0].playerid}, division says ${division.winnerid}\n${JSON.stringify(tourney)}`);
            }
            for (let p = 1; p <= players.length; p++) {
                const player = players[p-1];
                let won = false;
                if (p === 1) {
                    won = true;
                }
                let t50 = false;
                if (p < (players.length / 2)) {
                    t50 = true;
                }
                const score = 100 * ((players.length - p) / (players.length - 1));
                const result: ResultsNode = {
                    pid: player.playerid,
                    tid: tourney.id,
                    metaGame: tourney.metaGame,
                    won,
                    t50,
                    score,
                }
                const ind: TournamentNode = {
                    pid: player.playerid,
                    tid: tourney.id,
                    metaGame: tourney.metaGame,
                    place: p,
                    participants: players.length,
                    score,
                };
                pushToMap(summary, player.playerid, result);
                pushToMap(individual, player.playerid, ind);
            }
        }
    }
    console.log(`tournament-data: ${summary.size} summary entries; ${individual.size} individual entries`);

    // tabulate the summaries
    const finalSummary: Summary = [];
    for (const [player, entries] of summary.entries()) {
        const count = entries.length;
        const won = entries.filter(r => r.won).length;
        const t50 = entries.filter(r => r.t50).length;
        const scores = entries.map(r => r.score);
        const scoreSum = scores.reduce((acc, curr) => acc + curr, 0);
        const scoreAvg = scoreSum / scores.length;
        scores.sort((a, b) => a - b);
        let scoreMed: number;
        if (scores.length % 2 === 0) {
            const rightIdx = scores.length / 2;
            const leftIdx = rightIdx - 1;
            scoreMed = (scores[leftIdx] + scores[rightIdx]) / 2;
        } else {
            scoreMed = scores[Math.floor(scores.length / 2)];
        }
        finalSummary.push({
            player,
            count,
            won,
            t50,
            scoreSum,
            scoreAvg,
            scoreMed
        });
    }

    // write files to S3
    // summary
    const cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: "tournament-summary.json",
        Body: JSON.stringify(finalSummary),
    });
    const response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
    }
    console.log("Summary data done");

    // individual results
    for (const [player, lst] of individual.entries()) {
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `player/tournaments/${player}.json`,
            Body: JSON.stringify(lst),
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Individual data done");

    console.log("ALL DONE");
};
