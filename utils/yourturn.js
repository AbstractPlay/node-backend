'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const handler = ( /*event: EventBridgeEvent<any,any>, context*/) => __awaiter(void 0, void 0, void 0, function* () {
    // Get list of all active games
    try {
        let data = yield ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "CURRENTGAMES" },
            ExpressionAttributeNames: { "#pk": "pk", "#id": "id" },
            ProjectionExpression: "#id, metaGame, players, toMove",
            ReturnConsumedCapacity: "INDEXES",
        }));
        const games = data === null || data === void 0 ? void 0 : data.Items;
        console.log(JSON.stringify(games, null, 2));
        // Map players whose turn it is to the list of games waiting on them
        if (games !== undefined) {
            const p2g = new Map();
            for (const g of games) {
                const toMove = g.players[g.toMove];
                if (p2g.has(toMove.id)) {
                    const lst = p2g.get(toMove.id);
                    lst.push(g);
                    p2g.set(toMove.id, [...lst]);
                }
                else {
                    p2g.set(toMove.id, [g]);
                }
            }
            console.log(JSON.stringify(p2g, null, 2));
            // Get list of users
            data = yield ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "USER" },
                ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#name": "name", "#language": "language", "#settings": "settings" },
                ProjectionExpression: "#id, #name, email, #language, #settings",
                ReturnConsumedCapacity: "INDEXES",
            }));
            const players = data === null || data === void 0 ? void 0 : data.Items;
            console.log(JSON.stringify(players, null, 2));
            // Collate user data with players whose turn it is, but only those electing to receive notifications
            if (players !== undefined) {
                const notifications = [];
                for (const [p, gs] of p2g.entries()) {
                    const player = players.find(x => x.id === p);
                    if (player !== undefined) {
                        if (player.language === undefined) {
                            player.language = "en";
                        }
                        if ((player.settings._notification === undefined) || (player.settings._notification.yourturn)) {
                            notifications.push([player, gs.length]);
                        }
                    }
                }
                console.log(JSON.stringify(notifications, null, 2));
                // Now send notifications
                yield (0, abstractplay_1.initi18n)("en");
                const work = [];
                // Sort by language to minimize locale changes
                notifications.sort((a, b) => a[0].language.localeCompare(b[0].language));
                let lastlang = undefined;
                for (const [p, n] of notifications) {
                    if (p.language !== lastlang) {
                        lastlang = p.language;
                        yield i18next_1.default.changeLanguage(p.language);
                    }
                    const comm = (0, abstractplay_1.createSendEmailCommand)(p.email, p.name, i18next_1.default.t("YourMoveSubject"), i18next_1.default.t("YourMoveBatchedBody", { count: n }));
                    work.push(sesClient.send(comm));
                }
                yield Promise.all(work);
                console.log("Done!");
            }
        }
    }
    catch (error) {
        (0, abstractplay_1.logGetItemError)(error);
        return (0, abstractplay_1.formatReturnError)(`Unable to get active games and players from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
});
exports.handler = handler;
