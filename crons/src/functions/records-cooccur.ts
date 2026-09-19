'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import { type BasicRec, type GameRec } from "types/index.js";
import {
    buildCooccurArtifact,
    DEFAULT_MIN_COOCCURRENCE,
    unionCoPlaySet,
} from "../utils/cooccurPmi.js";
import { putRecordsJson } from "../utils/recordsJson.js";
import { skipCompletedGameWithoutState, resolveGameMetaGame } from "../utils/completedGameRec.js";

const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });
const DUMP_BUCKET = "abstractplay-db-dump";
const REC_BUCKET = "records.abstractplay.com";
const COOCCUR_KEY = "recommendations/cooccur.json";

type UserRec = {
    pk: string;
    sk: string;
    stars?: string[];
};

function pushToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    const existing = map.get(key);
    if (existing !== undefined) {
        existing.add(value);
    } else {
        map.set(key, new Set([value]));
    }
}

export const handler: Handler = async () => {
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
                throw new Error("Could not list the bucket contents");
            }
            allContents.push(...Contents);
            isTruncatedOuter = IsTruncatedInner || false;
            command.input.ContinuationToken = NextContinuationToken;
        }
    } catch (err) {
        console.error(err);
        throw err;
    }

    const manifests = allContents.filter((c) => c.Key?.includes("manifest-summary.json"));
    manifests.sort((a, b) => b.LastModified!.toISOString().localeCompare(a.LastModified!.toISOString()));
    const latest = manifests[0];
    if (latest?.Key === undefined) {
        throw new Error("No manifest-summary.json found in dump bucket");
    }
    const match = latest.Key.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
    if (match === null) {
        throw new Error(`Could not extract uid from "${latest.Key}"`);
    }
    const uid = match[1];
    const dataFiles = allContents.filter((c) => c.Key?.includes(`${uid}/data/`) && c.Key?.endsWith(".ion.gz"));
    console.log(`Found ${dataFiles.length} data files for export uid ${uid}`);

    const playedByPlayer = new Map<string, Set<string>>();
    const starredByPlayer = new Map<string, Set<string>>();

    for (const file of dataFiles) {
        console.log(`Loading ${file.Key}`);
        const getCmd = new GetObjectCommand({
            Bucket: DUMP_BUCKET,
            Key: file.Key,
        });

        try {
            const response = await s3.send(getCmd);
            const bytes = await response.Body?.transformToByteArray();
            if (bytes === undefined) {
                throw new Error(`Could not load bytes from file ${file.Key}`);
            }
            const ion = gunzipSync(bytes);
            let sofar = "";
            let ptr = 0;
            const chunk = 1_000_000;
            while (ptr < ion.length) {
                sofar += strFromU8(ion.slice(ptr, ptr + chunk));
                while (sofar.includes("}}\n")) {
                    const idx = sofar.indexOf("}}\n");
                    const line = sofar.substring(0, idx + 2);
                    sofar = sofar.substring(idx + 3);
                    try {
                        const outerRec = loadIon(line);
                        if (outerRec === null) {
                            continue;
                        }
                        const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                        const rec = json.Item;
                        if (rec.pk === "GAME" && rec.sk.includes("#1#")) {
                            if (skipCompletedGameWithoutState(rec)) {
                                continue;
                            }
                            const gdata = rec as GameRec;
                            const metaGame = resolveGameMetaGame(gdata);
                            if (!metaGame || !Array.isArray(gdata.players)) {
                                console.warn(
                                    `Skipping completed GAME without metaGame or players: sk=${gdata.sk}`,
                                );
                                continue;
                            }
                            for (const player of gdata.players) {
                                pushToSetMap(playedByPlayer, player.id, metaGame);
                            }
                        } else if (rec.pk === "USER") {
                            const user = rec as UserRec;
                            if (Array.isArray(user.stars)) {
                                for (const meta of user.stars) {
                                    if (typeof meta === "string" && meta.length > 0) {
                                        pushToSetMap(starredByPlayer, user.sk, meta);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.log(`An error occurred while loading an ION record: ${line}`);
                        console.error(err);
                    }
                }
                ptr += chunk;
            }
        } catch (err) {
            console.log(`An error occurred while reading data file ${JSON.stringify(file)}`);
            console.error(err);
            throw err;
        }
    }

    const playerIds = new Set<string>([...playedByPlayer.keys(), ...starredByPlayer.keys()]);
    const playerCoPlaySets: Set<string>[] = [];
    for (const playerId of playerIds) {
        const played = playedByPlayer.get(playerId) ?? new Set<string>();
        const starred = starredByPlayer.get(playerId) ?? new Set<string>();
        playerCoPlaySets.push(unionCoPlaySet(played, starred));
    }

    console.log(
        `Co-occurrence input: ${playerIds.size} players, `
        + `${playedByPlayer.size} with completed games, ${starredByPlayer.size} with stars`,
    );

    const artifact = buildCooccurArtifact(playerCoPlaySets, {
        minCooccurrence: DEFAULT_MIN_COOCCURRENCE,
        includeStarredBoost: true,
        generatedAt: new Date().toISOString(),
    });

    await putRecordsJson(s3, COOCCUR_KEY, artifact);
    console.log(`Wrote ${COOCCUR_KEY} (${Object.keys(artifact.games).length} games with PMI neighbors)`);
    console.log("ALL DONE");
};
