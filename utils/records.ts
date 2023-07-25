'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand,  } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Handler } from "aws-lambda";
import { logGetItemError, formatReturnError } from '../api/abstractplay';
import { IAPGameState, gameinfo, GameFactory } from '@abstractplay/gameslib';
import { APGameRecord } from '@abstractplay/recranks';

const REGION = "us-east-1";
const s3 = new S3Client({region: REGION});
const clnt = new DynamoDBClient({ region: REGION });
const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);

type PartialGame = {
    id: string;
    metaGame: string;
    players: {
        id: string;
        name: string;
        time: number;
    }[];
    state: IAPGameState;
};

export const handler: Handler = async (event: any, context?: any) => {
    // Have to fetch data by metagame
    let totalUnits = 0;
    const gamesCollated: PartialGame[] = [];
    for (const metaGame of gameinfo.keys()) {
        try {
            const data = await ddbDocClient.send(
                new QueryCommand({
                    TableName: process.env.ABSTRACT_PLAY_TABLE,
                    KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                    ExpressionAttributeValues: { ":pk": "GAME", ":sk": `${metaGame}#1#` },
                    ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#sk": "sk", "#state": "state"},
                    ProjectionExpression: "#id, metaGame, players, #state",
                    ReturnConsumedCapacity: "INDEXES",
                })
            );
            if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
                totalUnits += data.ConsumedCapacity.CapacityUnits;
            } else {
                console.log(`Could not add consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
            }
            const games = data?.Items as PartialGame[];
            if (games === undefined) {
                throw new Error(`Could not get valid completed game data for ${metaGame}`);
            }
            gamesCollated.push(...games);
            console.log(JSON.stringify(games, null, 2));
        } catch (e) {
            logGetItemError(e);
            return formatReturnError(`Unable to get completed games from table ${process.env.ABSTRACT_PLAY_TABLE}`);
        }
    }
    console.log(`TOTAL UNITS CONSUMED: ${totalUnits}`);

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
    for (const gdata of gamesCollated) {
        const g = GameFactory(gdata.metaGame, gdata.state);
        if (g === undefined) {
            throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        const rec = g.genRecord({
            uid: gdata.id,
            players: gdata.players.map(p => { return {uid: p.id, name: p.name}; }),
        });
        if (rec === undefined) {
            throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:\n${JSON.stringify(gdata.state)}`);
        }
        allRecs.push(rec);
        pushToMap(metaRecs, gdata.metaGame, rec);
        for (const p of gdata.players) {
            pushToMap(userRecs, p.id, rec);
        }
    }

    // write files to S3
    const s3arn = "records.abstractplay.com";
    const fnAll = "_ALL.json";
    const bodyAll = JSON.stringify(allRecs);
    let cmd = new PutObjectCommand({
        Bucket: s3arn,
        Key: fnAll,
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
            Bucket: s3arn,
            Key: `_meta_${meta}.json`,
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
            Bucket: s3arn,
            Key: `_meta_${player}.json`,
            Body: JSON.stringify(recs),
        });
        response = await s3.send(cmd);
        if (response["$metadata"].httpStatusCode !== 200) {
            console.log(response);
        }
    }
    console.log("Player recs done");

    return;
};
