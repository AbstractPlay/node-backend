import { describe, expect, it, vi } from "vitest";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { enqueuePlayerSummaryWrites } from "./playerSummaryQueue.js";

describe("enqueuePlayerSummaryWrites", () => {
    it("sends messages in batches of 10", async () => {
        const send = vi.fn().mockResolvedValue({ Failed: [] });
        const sqs = { send } as unknown as import("@aws-sdk/client-sqs").SQSClient;
        const messages = Array.from({ length: 23 }, (_, i) => ({
            user: `user-${i}`,
            key: `player/user-${i}-summary.json`,
            slice: { generated: "t", user: `user-${i}`, players: {}, histograms: {}, ratings: { highest: [] } },
        }));
        await enqueuePlayerSummaryWrites(sqs, "https://sqs.example/queue", messages);
        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls[0]![0]).toBeInstanceOf(SendMessageBatchCommand);
        expect(send.mock.calls[0]![0].input.Entries).toHaveLength(10);
        expect(send.mock.calls[2]![0].input.Entries).toHaveLength(3);
    });

    it("throws when SQS reports batch failures", async () => {
        const send = vi.fn().mockResolvedValue({
            Failed: [{ Id: "0", Code: "InternalError", Message: "boom" }],
        });
        const sqs = { send } as unknown as import("@aws-sdk/client-sqs").SQSClient;
        await expect(enqueuePlayerSummaryWrites(sqs, "https://sqs.example/queue", [{
            user: "a",
            key: "player/a-summary.json",
            slice: { generated: "t", user: "a", players: {}, histograms: {}, ratings: { highest: [] } },
        }])).rejects.toThrow(/SendMessageBatch failed/);
    });
});
