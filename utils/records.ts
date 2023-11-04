'use strict';

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
// import { IAPGameState, gameinfo, GameFactory } from '@abstractplay/gameslib';
// import { APGameRecord } from '@abstractplay/recranks';

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});

export const handler: Handler = async (event: any, context?: any) => {
    // scan bucket for data folder
    const command = new ListObjectsV2Command({
        Bucket: "abstractplay-db-dump",
        // The default and maximum number of keys returned is 1000. This limits it to
        // one for demonstration purposes.
        MaxKeys: 1,
      });

      try {
        let isTruncatedOuter = true;

        console.log("Your bucket contains the following objects:\n");
        let contents = "";

        while (isTruncatedOuter) {
          const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } =
            await s3.send(command);
          if (Contents === undefined) {
            throw new Error(`Could not list the bucket contents`);
          }
          const contentsList = Contents.map((c) => ` • ${c.Key}`).join("\n");
          contents += contentsList + "\n";
          isTruncatedOuter = IsTruncatedInner || false;
          command.input.ContinuationToken = NextContinuationToken;
        }
        console.log(contents);
      } catch (err) {
        console.error(err);
      }

    // // for each game, generate a game record and categorize it
    // const pushToMap = (m: Map<string, any[]>, key: string, value: any) => {
    //     if (m.has(key)) {
    //         const current = m.get(key)!;
    //         m.set(key, [...current, value]);
    //     } else {
    //         m.set(key, [value]);
    //     }
    // }
    // const allRecs: APGameRecord[] = [];
    // const metaRecs = new Map<string, APGameRecord[]>();
    // const userRecs = new Map<string, APGameRecord[]>();
    // for (const gdata of gamesCollated) {
    //     const g = GameFactory(gdata.metaGame, gdata.state);
    //     if (g === undefined) {
    //         throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
    //     }
    //     const rec = g.genRecord({
    //         uid: gdata.id,
    //         players: gdata.players.map(p => { return {uid: p.id, name: p.name}; }),
    //     });
    //     if (rec === undefined) {
    //         throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
    //     }
    //     allRecs.push(rec);
    //     pushToMap(metaRecs, gdata.metaGame, rec);
    //     for (const p of gdata.players) {
    //         pushToMap(userRecs, p.id, rec);
    //     }
    // }

    // // write files to S3
    // const s3arn = "records.abstractplay.com";
    // const fnAll = "_ALL.json";
    // const bodyAll = JSON.stringify(allRecs);
    // let cmd = new PutObjectCommand({
    //     Bucket: s3arn,
    //     Key: fnAll,
    //     Body: bodyAll,
    // });
    // let response = await s3.send(cmd);
    // if (response["$metadata"].httpStatusCode !== 200) {
    //     console.log(response);
    // }
    // console.log("All records done");
    // // meta games
    // for (const [meta, recs] of metaRecs.entries()) {
    //     cmd = new PutObjectCommand({
    //         Bucket: s3arn,
    //         Key: `_meta_${meta}.json`,
    //         Body: JSON.stringify(recs),
    //     });
    //     response = await s3.send(cmd);
    //     if (response["$metadata"].httpStatusCode !== 200) {
    //         console.log(response);
    //     }
    // }
    // console.log("Meta games done");
    // // players
    // for (const [player, recs] of userRecs.entries()) {
    //     cmd = new PutObjectCommand({
    //         Bucket: s3arn,
    //         Key: `_meta_${player}.json`,
    //         Body: JSON.stringify(recs),
    //     });
    //     response = await s3.send(cmd);
    //     if (response["$metadata"].httpStatusCode !== 200) {
    //         console.log(response);
    //     }
    // }
    // console.log("Player recs done");
};
