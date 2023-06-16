'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ses_1 = require("@aws-sdk/client-ses");
const i18next_1 = __importDefault(require("i18next"));
const abstractplay_1 = require("../api/abstractplay");
const REGION = "us-east-1";
const sesClient = new client_ses_1.SESClient({ region: REGION });
const clnt = new client_dynamodb_1.DynamoDBClient({ region: REGION });
const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false,
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: true,
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(clnt, translateConfig);
const handler = async ( /*event: EventBridgeEvent<any,any>, context*/) => {
    // Get list of all active games
    try {
        let data = await ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "GAME" },
            ExpressionAttributeNames: { "#pk": "pk", "#id": "id" },
            ProjectionExpression: "#id, metaGame, players, toMove",
            ReturnConsumedCapacity: "INDEXES",
        }));
        console.log(`Consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
        let games = data?.Items;
        if (games !== undefined) {
            games = games.filter(g => ("toMove" in g) && (g.toMove !== undefined) && (g.toMove !== null) && (g.toMove.toString().length > 0));
            games.forEach(g => {
                if (typeof g.toMove === "string") {
                    g.toMove = parseInt(g.toMove, 10);
                }
            });
        }
        console.log(JSON.stringify(games, null, 2));
        // Map players whose turn it is to the list of games waiting on them
        if (games !== undefined) {
            const p2g = new Map();
            for (const g of games) {
                const toMove = [];
                if (Array.isArray(g.toMove)) {
                    for (let i = 0; i < g.toMove.length; i++) {
                        if (g.toMove[i]) {
                            toMove.push(i);
                        }
                    }
                }
                else {
                    toMove.push(g.toMove);
                }
                for (const num of toMove) {
                    const toMove = g.players[num];
                    if (p2g.has(toMove.id)) {
                        const lst = p2g.get(toMove.id);
                        lst.push(g);
                        p2g.set(toMove.id, [...lst]);
                    }
                    else {
                        p2g.set(toMove.id, [g]);
                    }
                }
            }
            console.log(JSON.stringify(p2g, null, 2));
            // Get list of users
            data = await ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "USER" },
                ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#name": "name", "#language": "language", "#settings": "settings" },
                ProjectionExpression: "#id, #name, email, #language, #settings",
                ReturnConsumedCapacity: "INDEXES",
            }));
            const players = data?.Items;
            console.log(JSON.stringify(players, null, 2));
            // Collate user data with players whose turn it is, but only those electing to receive notifications and who have valid email addresses
            if (players !== undefined) {
                const notifications = [];
                for (const [p, gs] of p2g.entries()) {
                    const player = players.find(x => x.id === p);
                    if (player !== undefined) {
                        if (player.language === undefined) {
                            player.language = "en";
                        }
                        if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
                            if ((player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.yourturn)) {
                                notifications.push([player, gs.length]);
                            }
                            else {
                                console.log(`Player ${player.name} (${player.id}) has elected to not receive YourTurn notifications.`);
                            }
                        }
                        else {
                            console.log(`No verified email address found for ${player.name} (${player.id})`);
                        }
                    }
                }
                console.log(JSON.stringify(notifications, null, 2));
                // Now send notifications
                await (0, abstractplay_1.initi18n)("en");
                const work = [];
                // Sort by language to minimize locale changes
                notifications.sort((a, b) => a[0].language.localeCompare(b[0].language));
                let lastlang = undefined;
                for (const [p, n] of notifications) {
                    if (p.language !== lastlang) {
                        lastlang = p.language;
                        await i18next_1.default.changeLanguage(p.language);
                    }
                    const comm = (0, abstractplay_1.createSendEmailCommand)(p.email, p.name, i18next_1.default.t("YourMoveSubject"), i18next_1.default.t("YourMoveBatchedBody", { count: n }));
                    work.push(sesClient.send(comm));
                }
                await Promise.all(work);
                console.log("Done!");
            }
        }
    }
    catch (error) {
        (0, abstractplay_1.logGetItemError)(error);
        return (0, abstractplay_1.formatReturnError)(`Unable to get active games and players from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
};
exports.handler = handler;
