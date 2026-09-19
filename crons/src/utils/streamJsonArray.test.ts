import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { streamJsonArrayFromReadable } from "./streamJsonArray.js";

describe("streamJsonArray", () => {
    it("yields each array element without JSON.parse on the full buffer", async () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const readable = Readable.from([JSON.stringify(items)]);
        const seen: number[] = [];
        const count = await streamJsonArrayFromReadable<{ id: number }>(readable, (item) => {
            seen.push(item.id);
        });
        expect(count).toBe(3);
        expect(seen).toEqual([1, 2, 3]);
    });
});
