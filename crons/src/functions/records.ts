'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory, addResource } from '@abstractplay/gameslib';
import { type APGameRecord } from '@abstractplay/recranks';
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import { type BasicRec, type GameRec, type Tournament, type OrgEvent, type OrgEventGame } from "types/index.js";
import i18next from "i18next";
import type { i18n } from "i18next";
import enApgames from "@abstractplay/gameslib/locales/en/apgames.json";
import enApresults from "@abstractplay/gameslib/locales/en/apresults.json";
import { decompressGameState } from "../utils/gameState.js";
import { encodeRecordGameId } from "../utils/recordGameId.js";
import { resolveGameVariantUids } from "../utils/resolveGameVariants.js";
import { findTournamentForGame } from "../utils/recordTournament.js";
import { gameRecordIsUnrated } from "../utils/recordUnrated.js";
import { putRecordsJson } from "../utils/recordsJson.js";
import { skipCompletedGameWithoutState } from "../utils/completedGameRec.js";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const DUMP_BUCKET = "abstractplay-db-dump";
const REC_BUCKET = "records.abstractplay.com";
/** Legacy built-in AI opponent (see node-backend AIAI_USERID). */
const LEGACY_BOT_ID = "SkQfHAjeDxs8eeEnScuYA";

export const handler: Handler = async (event: any, context?: any) => {
  const i18nInstance = i18next as unknown as i18n;
  await (i18nInstance
  .init({
    lng: "en",
    fallbackLng: "en",
    debug: true,
  })
  .then(async function() {
    if (!i18nInstance.isInitialized) {
        throw new Error(`i18n is not initialized where it should be!`);
    }
    addResource("en", undefined, {
        bundles: { apgames: enApgames, apresults: enApresults },
    });
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
    const registeredBots = new Set<string>([LEGACY_BOT_ID]);
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
                                if ( (rec.pk === "GAME") && (rec.sk.includes("#1#")) ) {
                                    if (skipCompletedGameWithoutState(rec)) {
                                        continue;
                                    }
                                    justGames.push(rec as GameRec);
                                } else if (rec.pk === "TOURNAMENT" || rec.pk === "COMPLETEDTOURNAMENT") {
                                    tournaments.push(rec as Tournament);
                                } else if (rec.pk === "ORGEVENT") {
                                    events.push(rec as OrgEvent);
                                } else if (rec.pk === "ORGEVENTGAME") {
                                    eventGames.push(rec as OrgEventGame);
                                } else if (rec.pk === "BOT") {
                                    registeredBots.add(rec.sk);
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
                throw new Error(`Could not load bytes from ${file.Key}`);
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`Found ${justGames.length} completed GAME records`);
    console.log(`Found ${registeredBots.size} registered bots`);

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
    for (const gdata of justGames) {
        const g = GameFactory(gdata.metaGame, decompressGameState(gdata.state));
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id} (sk=${gdata.sk}):\n${JSON.stringify(gdata.state)}`);
        }
        let event: string|null = null;
        let round: string|null = null;
        if (gdata.tournament !== undefined) {
            const trec = findTournamentForGame(tournaments, gdata.tournament, gdata.metaGame);
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
        const variantUids = resolveGameVariantUids(g.variants, gdata.variants, {
            metaGame: gdata.metaGame,
            gameId: gdata.id,
        });
        if (variantUids.length > 0 && (g.variants?.length ?? 0) === 0) {
            g.variants = variantUids;
        }
        const unrated = gameRecordIsUnrated(gdata.metaGame, variantUids, gdata.rated);
        const rec = g.genRecord({
            uid: encodeRecordGameId(gdata.id, gdata.metaGame, variantUids),
            players: gdata.players.map(p => ({
                uid: p.id,
                name: p.name,
                isai: registeredBots.has(p.id) ? true : undefined,
            })),
            event: event !== null ? event : undefined,
            round: round !== null ? round : undefined,
            unrated: unrated ? true : undefined,
        });
        if (rec === undefined) {
            throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        // check for pie
        if ( (gdata.pieInvoked !== undefined) && (gdata.pieInvoked) ) {
            rec.header.pied = true;
        }
        // Solo runs archive independently — multiple ALL.json rows per (userid, challenge-seed) are expected.
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
    }
    console.log(`allRecs: ${allRecs.length}, metaRecs: ${[...metaRecs.keys()].length}, userRecs: ${[...userRecs.keys()].length}, eventRecs: ${[...eventRecs.keys()].length}`);

    // // only print the last 10 LoA records to console then quit
    // const loa = metaRecs.get("loa")!.slice(-10);
    // for (const rec of loa) {
    //     console.log(JSON.stringify(rec.header))
    // }

    // write files to S3
    await putRecordsJson(s3, "ALL.json", allRecs);
    console.log("All records done");
    for (const [meta, recs] of metaRecs.entries()) {
        await putRecordsJson(s3, `meta/${meta}.json`, recs);
    }
    console.log("Meta games done");
    for (const [player, recs] of userRecs.entries()) {
        await putRecordsJson(s3, `player/${player}.json`, recs);
    }
    console.log("Player recs done");
    for (const [eventid, recs] of eventRecs.entries()) {
        await putRecordsJson(s3, `event/${eventid}.json`, recs);
    }
    console.log("Event recs done");

    console.log("ALL DONE");
  })
  .catch(err => {
    throw new Error(`records handler failed:\n${err}`);
  }));
};
