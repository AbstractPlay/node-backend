'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, QueryCommandOutput, QueryCommandInput, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo, GameFactory, GameBase } from '@abstractplay/gameslib';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import i18n from 'i18next';
import { Handler, EventBridgeEvent } from "aws-lambda";
import en from '../locales/en/apback.json';
import fr from '../locales/fr/apback.json';
import it from '../locales/it/apback.json';
import type { User, Game } from '../api/abstractplay';
import { createSendEmailCommand, logGetItemError, formatReturnError, initi18n } from '../api/abstractplay';

const REGION = "us-east-1";
const sesClient = new SESClient({ region: REGION });
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
const headers = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

type PartialGame = {
    id: string;
    metaGame: string;
    players: {
        id: string;
        name: string;
        time: number;
    }[];
    toMove: number;
};

type PartialUser = {
    id: string;
    name: string;
    email: string;
    language: string;
    settings: {
        [k: string]: any;
        _notification?: {
            gameStarted: boolean;
            gameEnded: boolean;
            challenges: boolean;
            yourturn: boolean;
        }
    };
};

export const handler: Handler = async (event: EventBridgeEvent<any,any>, context) => {
    // Get list of all active games
    try {
        let data = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "CURRENTGAMES" },
                ExpressionAttributeNames: { "#pk": "pk", "#id": "id"},
                ProjectionExpression: "#id, metaGame, players, toMove",
                ReturnConsumedCapacity: "INDEXES",
            })
        );
        const games = data?.Items as PartialGame[];

        // Map players whose turn it is to the list of games waiting on them
        if (games !== undefined) {
            const p2g = new Map<string, PartialGame[]>();
            for (const g of games) {
                const toMove = g.players[g.toMove];
                if (p2g.has(toMove.id)) {
                    const lst = p2g.get(toMove.id)!;
                    lst.push(g);
                    p2g.set(toMove.id, [...lst]);
                } else {
                    p2g.set(toMove.id, [g]);
                }
            }

            // Get list of users
            data = await ddbDocClient.send(
                new QueryCommand({
                    TableName: process.env.ABSTRACT_PLAY_TABLE,
                    KeyConditionExpression: "#pk = :pk",
                    ExpressionAttributeValues: { ":pk": "USER" },
                    ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#name": "name", "#language": "language", "#settings": "settings" },
                    ProjectionExpression: "#id, #name, email, #language, #settings",
                    ReturnConsumedCapacity: "INDEXES",
                })
            );
            const players = data?.Items as PartialUser[];

            // Collate user data with players whose turn it is, but only those electing to receive notifications
            if (players !== undefined) {
                const notifications: [PartialUser, number][] = [];
                for (const [p, gs] of p2g.entries()) {
                    const player = players.find(x => x.id === p);
                    if (player !== undefined) {
                        if (player.language === undefined) {
                            player.language = "en";
                        }
                        if ( (player.settings._notification === undefined) || (player.settings._notification.yourturn) ) {
                            notifications.push([player, gs.length]);
                        }
                    }
                }

                // Now send notifications
                await initi18n("en");
                const work: Promise<any>[] =  [];

                // Sort by language to minimize locale changes
                notifications.sort((a, b) => a[0].language.localeCompare(b[0].language));
                let lastlang: string|undefined = undefined;
                for (const [p, n] of notifications) {
                    if (p.language !== lastlang) {
                        lastlang = p.language;
                        await i18n.changeLanguage(p.language);
                    }
                    const comm = createSendEmailCommand(p.email, p.name, i18n.t("YourMoveSubject"), i18n.t("YourMoveBatchedBody", { count: n }));
                    work.push(sesClient.send(comm));
                }
                await Promise.all(work);
                console.log("Done!");
            }
        }
    }catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to get active games and players from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
};
