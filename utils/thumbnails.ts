'use strict';

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { CloudFrontClient, CreateInvalidationCommand, type CreateInvalidationCommandInput } from "@aws-sdk/client-cloudfront";
import { GameFactory, addResource, gameinfo, type APGamesInformation } from '@abstractplay/gameslib';
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import { ReservoirSampler } from "../lib/ReservoirSampler";
import { type StatSummary } from "./summarize";
import i18n from 'i18next';
// import enGames from "@abstractplay/gameslib/locales/en/apgames.json";
import enBack from "../locales/en/apback.json";
import { registerWindow, SVG, Svg } from "@svgdotjs/svg.js";
import { APRenderRep, type IRenderOptions, addPrefix, render } from "@abstractplay/renderer";

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const DUMP_BUCKET = "abstractplay-db-dump";
const REC_BUCKET = "thumbnails.abstractplay.com";
const STATS_BUCKET = "records.abstractplay.com";
const cloudfront = new CloudFrontClient({region: REGION});

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

    // get list of production metas
    const gameInfoProd = ([...gameinfo.values()] as APGamesInformation[]).filter(rec => !rec.flags.includes("experimental"));

    // load summary stats
    const cmd = new GetObjectCommand({
        Bucket: STATS_BUCKET,
        Key: "_summary.json"
    });
    const response = await s3.send(cmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
        chunks.push(chunk as Uint8Array);
    }
    const fileContent = Buffer.concat(chunks).toString("utf-8");
    const parsed = JSON.parse(fileContent) as StatSummary;
    const stats = parsed.metaStats;

    // determine minimum and maximum move numbers
    const MIN = 5;
    const MAX = 1000;
    const meta2min = new Map<string, number>();
    const meta2max = new Map<string, number>();
    gameInfoProd.forEach(rec => {
        if (rec.name in stats) {
            const len = stats[rec.name].lenMedian;
            meta2min.set(rec.uid, Math.round(len * 0.25));
            meta2max.set(rec.uid, Math.round(len * 0.75));
        } else {
            console.log(`Could not find meta stats for "${rec.uid}".`);
        }
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
                                    const g = GameFactory(meta, rec.state);
                                    if (g === undefined) {
                                        throw new Error(`Error instantiating the following game record:\n${rec}`);
                                    }
                                    const numMoves = g.stack.length;
                                    const min = meta2min.get(meta) || MIN;
                                    if (numMoves >= min) {
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
    //   - Select a random move between p25 and p75
    //   - Render and store the JSON
    const allRecs = new Map<string, APRenderRep>();
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
        allRecs.set(meta, json);
    }
    console.log(`Generated ${allRecs.size} thumbnails`);

    // look for games with no thumbnails
    const metasProd = gameInfoProd.map(rec => rec.uid);
    const keys = [...allRecs.keys()].filter(id => !metasProd.includes(id));
    if (keys.length > 0) {
        console.log(`${keys.length} production games do not have active or completed game records, and so no thumbnail was generated: ${JSON.stringify(keys)}`);
    }

    // write files to S3
    // meta games
    for (const [meta, json] of allRecs.entries()) {
        const cmd = new PutObjectCommand({
            Bucket: REC_BUCKET,
            Key: `${meta}.json`,
            Body: JSON.stringify(json),
        });
        const response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Thumbnails stored");

    // pre-render light and dark mode versions of the SVGs
    console.log("Attempting to pre-render light/dark SVGs");
    const contextLight = {
        background: "#fff",
        strokes: "#000",
        borders: "#000",
        labels: "#000",
        annotations: "#000",
        fill: "#000",
    };
    const contextDark = {
        background: "#222",
        strokes: "#6d6d6d",
        borders: "#000",
        labels: "#009fbf",
        annotations: "#99cccc",
        fill: "#e6f2f2",
    };
    const contexts = new Map<string, {[k: string]: string}>([
        ["light", contextLight],
        ["dark", contextDark],
    ]);
    // Dynamically import the ESM wrapper
    const { makeWindow } = await import('../lib/svgdom-wrapper.mjs');
    // Example: generate an ID using nanoid wrapper
    const { generateId } = await import('../lib/nanoid-wrapper.mjs');
    const window = makeWindow();
    const document = window.document;

    // register window and document
    registerWindow(window, document);
    for (const [meta, json] of allRecs.entries()) {
        const prefix = generateId();
        for (const [name, context] of contexts.entries()) {
            const canvas = SVG(document.documentElement) as Svg;
            const opts: IRenderOptions = {prefix, target: canvas, colourContext: context};
            render(json as APRenderRep, opts)
            const svgStr = addPrefix(canvas.svg(), opts);
            const cmd = new PutObjectCommand({
                Bucket: REC_BUCKET,
                Key: `${meta}-${name}.svg`,
                Body: svgStr,
            });
            const response = await s3.send(cmd);
            if (response["$metadata"].httpStatusCode !== 200) {
                console.log(response);
            }
        }
    }
    console.log("Pre-rendering complete")

    // invalidate CloudFront distribution
    const cfParams: CreateInvalidationCommandInput = {
        DistributionId: "E3MX0I75ULVTVT",
        InvalidationBatch: {
            CallerReference: Date.now().toString(),
            Paths: {
                Quantity: 1,
                Items: ["/*"],
            },
        },
    };
    const cfCmd = new CreateInvalidationCommand(cfParams);
    const cfResponse = await cloudfront.send(cfCmd);
    if (cfResponse["$metadata"].httpStatusCode !== 200) {
        console.log(cfResponse);
    }
    console.log("Invalidation sent");

    console.log("ALL DONE");
  })
  .catch(err => {
    throw new Error(`An error occurred (final catch):\n${err}`);
  }));
};
