'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory, addResource } from '@abstractplay/gameslib';
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import { ReservoirSampler } from "../lib/ReservoirSampler";
import i18n from 'i18next';
// import enGames from "@abstractplay/gameslib/locales/en/apgames.json";
import enBack from "../locales/en/apback.json";

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

type SamplerEntry = {
    active: ReservoirSampler<GameRec>;
    completed: ReservoirSampler<GameRec>;
}

export const handler: Handler = async (event: any, context?: any) => {
  await (i18n
  .init({
    ns: ["apback"],
    defaultNS: "apback",
    lng: "en",
    fallbackLng: "en",
    debug: true,
    resources: {
        en: {
            apback: enBack,
        }
    }
  })
  .then(async function() {
    if (!i18n.isInitialized) {
        throw new Error(`i18n is not initialized where it should be!`);
    }
    addResource("en");
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
    const samplerMap = new Map<string, SamplerEntry>();
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
                                    const [meta, cbit,] = rec.sk.split("#");
                                    if (samplerMap.has(meta)) {
                                        const sampler = samplerMap.get(meta)!;
                                        if (cbit === "1") {
                                            sampler.completed.add(rec as GameRec);
                                        } else {
                                            sampler.active.add(rec as GameRec);
                                        }
                                    } else {
                                        const sampler: SamplerEntry = {
                                            completed: new ReservoirSampler<GameRec>(),
                                            active: new ReservoirSampler<GameRec>(),
                                        };
                                        if (cbit === "1") {
                                            sampler.completed.add(rec as GameRec);
                                        } else {
                                            sampler.active.add(rec as GameRec);
                                        }
                                        samplerMap.set(meta, sampler);
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
            } else {
                throw new Error(`Could not load bytes from ${file.Key}`);
            }
          } catch (err) {
            console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`)
            console.error(err);
          }
    }
    console.log(`GAME records processed`);

    // We now have a list of random records for each game. For each one:
    //   - Instantiate
    //   - Serialize it with the `strip` option to strip out hidden information
    //   - Render and store the JSON
    const allRecs = new Map<string, string>();
    for (const [meta, entry] of samplerMap.entries()) {
        const active = entry.active.getSample();
        let rec: GameRec;
        if (active.length > 0) {
            rec = active[0];
        } else {
            const completed = entry.completed.getSample();
            if (completed.length === 0) {
                console.log(`No active or completed games found for meta "${meta}"! Failsafe needed.`);
                continue;
            }
            rec = completed[0];
        }
        let g = GameFactory(meta, rec.state);
        if (g === undefined) {
            throw new Error(`Error instantiating the following game record:\n${rec}`);
        }
        const stripped = g.serialize({strip: true});
        g = GameFactory(meta, stripped);
        if (g === undefined) {
            throw new Error(`Error instantiating the following game record AFTER STRIPPING:\n${rec}`);
        }
        const json = g.render({});
        allRecs.set(meta, JSON.stringify(json));
    }
    console.log(`Generated ${allRecs.size} thumbnails`);

    // write files to S3
    // meta games
    for (const [meta, json] of allRecs.entries()) {
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `${meta}.json`,
            Body: json,
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Thumbnails stored");

    console.log("ALL DONE");
  })
  .catch(err => {
    throw new Error(`An error occurred while initializing i18next:\n${err}`);
  }));
};
