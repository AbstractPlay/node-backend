import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { GameFactory, addResource, gameinfo, type APGamesInformation } from "@abstractplay/gameslib";
import enApgames from "@abstractplay/gameslib/locales/en/apgames.json";
import enApresults from "@abstractplay/gameslib/locales/en/apresults.json";
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import { ReservoirSampler } from "../utils/ReservoirSampler.js";
import { resolveRenderLabels } from "../utils/resolveRenderLabels.js";
import type { ThumbnailRenderOutput } from "../utils/thumbnailRenderRep.js";
import { THUMB_BUCKET, THUMBNAIL_BROKEN_METAS } from "../utils/thumbnailConfig.js";
import { decompressGameState } from "../utils/gameState.js";
import { skipCompletedGameWithoutState } from "../utils/completedGameRec.js";
import i18next from "i18next";
import type { i18n } from "i18next";
import type { BasicRec, GameRec } from "types/index.js";

const REGION = "us-east-1";
const s3 = new S3Client({ region: REGION });
const DUMP_BUCKET = "abstractplay-db-dump";
const RENDER_BUCKET = process.env.RENDER_BUCKET;
const THUMBNAIL_CACHE_CONTROL = "public, max-age=86400";
const MIN_MOVES = 5;

type SamplerEntry = {
    active: ReservoirSampler<GameRec>;
    completed: ReservoirSampler<GameRec>;
};

export const handler: Handler = async () => {
    const i18nInstance = i18next as unknown as i18n;
    await i18nInstance
        .init({
            lng: "en",
            fallbackLng: "en",
            debug: true,
        })
        .then(async () => {
            if (!i18nInstance.isInitialized) {
                throw new Error("i18n is not initialized where it should be!");
            }
            const gamesI18n = addResource("en", undefined, {
                bundles: { apgames: enApgames, apresults: enApresults },
            });

            const gameInfoProd = ([...gameinfo.values()] as APGamesInformation[]).filter(
                (rec) => !rec.flags.includes("experimental"),
            );

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
            }

            const manifests = allContents.filter((c) => c.Key?.includes("manifest-summary.json"));
            manifests.sort((a, b) => b.LastModified!.toISOString().localeCompare(a.LastModified!.toISOString()));
            const latest = manifests[0];
            const match = latest.Key!.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
            if (match === null) {
                throw new Error(`Could not extract uid from "${latest.Key}"`);
            }

            const uid = match[1];
            const dataFiles = allContents.filter(
                (c) => c.Key?.includes(`${uid}/data/`) && c.Key?.endsWith(".ion.gz"),
            );
            console.log(`Found the following matching data files:\n${JSON.stringify(dataFiles, null, 2)}`);

            const samplerMap = new Map<string, SamplerEntry>();
            for (const file of dataFiles) {
                console.log(`Loading ${file.Key}`);
                const getCmd = new GetObjectCommand({
                    Bucket: DUMP_BUCKET,
                    Key: file.Key,
                });

                try {
                    const response = await s3.send(getCmd);
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
                                const line = sofar.substring(0, idx + 2);
                                sofar = sofar.substring(idx + 3);
                                try {
                                    const outerRec = loadIon(line);
                                    if (outerRec === null) {
                                        console.log(
                                            `Could not load ION record, usually because of an empty line.\nOffending line: "${line}"`,
                                        );
                                    } else {
                                        const json = JSON.parse(JSON.stringify(outerRec)) as BasicRec;
                                        const rec = json.Item;
                                        if (rec.pk === "GAME") {
                                            const [meta, cbit] = rec.sk.split("#");
                                            if (cbit === "1" && skipCompletedGameWithoutState(rec)) {
                                                continue;
                                            }
                                            if (rec.state === undefined || rec.state === "") {
                                                continue;
                                            }
                                            const g = GameFactory(meta, decompressGameState(rec.state));
                                            if (g === undefined) {
                                                throw new Error(
                                                    `Error instantiating the following game record:\n${rec}`,
                                                );
                                            }
                                            const numMoves = g.stack.length;
                                            if (numMoves >= MIN_MOVES) {
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
                    console.log(
                        `An error occured while reading data files. The specific file was ${JSON.stringify(file)}`,
                    );
                    console.error(err);
                }
            }
            console.log("GAME records processed");

            const allRecs = new Map<string, ThumbnailRenderOutput>();
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
                let g = GameFactory(meta, decompressGameState(rec.state));
                if (g === undefined) {
                    throw new Error(`Error instantiating the following game record:\n${rec}`);
                }
                const stripped = g.serialize({ strip: true });
                g = GameFactory(meta, stripped);
                if (g === undefined) {
                    throw new Error(
                        `Error instantiating the following game record AFTER STRIPPING:\n${rec}`,
                    );
                }
                const rep = g.render({}) as ThumbnailRenderOutput;
                const resolved = resolveRenderLabels(rep, rec.players, (key, params) =>
                    String(gamesI18n.t(key, params ?? {})),
                );
                allRecs.set(meta, resolved);
            }
            console.log(`Generated ${allRecs.size} thumbnails`);

            const metasProd = gameInfoProd.map((rec) => rec.uid);
            const keys = [...allRecs.keys()].filter((id) => !metasProd.includes(id));
            if (keys.length > 0) {
                console.log(
                    `${keys.length} production games do not have active or completed game records, and so no thumbnail was generated: ${JSON.stringify(keys)}`,
                );
            }

            for (const [meta, rep] of allRecs.entries()) {
                const body = JSON.stringify(rep);
                let cmd = new PutObjectCommand({
                    Bucket: THUMB_BUCKET,
                    Key: `${meta}.json`,
                    Body: body,
                    CacheControl: THUMBNAIL_CACHE_CONTROL,
                    ContentType: "application/json",
                });
                let response = await s3.send(cmd);
                if (response["$metadata"].httpStatusCode !== 200) {
                    console.log(response);
                }
                if (!THUMBNAIL_BROKEN_METAS.includes(meta)) {
                    cmd = new PutObjectCommand({
                        Bucket: RENDER_BUCKET,
                        Key: `${meta}.json`,
                        Body: body,
                        CacheControl: THUMBNAIL_CACHE_CONTROL,
                        ContentType: "application/json",
                    });
                    response = await s3.send(cmd);
                    if (response["$metadata"].httpStatusCode !== 200) {
                        console.log(response);
                    }
                }
            }
            console.log("Thumbnails stored");
            console.log("ALL DONE");
        })
        .catch((err) => {
            throw new Error(`An error occurred (final catch):\n${err}`);
        });
};
