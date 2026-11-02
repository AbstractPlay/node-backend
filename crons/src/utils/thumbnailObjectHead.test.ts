import { describe, expect, it } from "vitest";
import { isS3MissingObjectError } from "./thumbnailObjectHead.js";

describe("isS3MissingObjectError", () => {
    it("recognizes NoSuchKey and NotFound", () => {
        expect(isS3MissingObjectError({ name: "NoSuchKey" })).toBe(true);
        expect(isS3MissingObjectError({ name: "NotFound" })).toBe(true);
    });

    it("recognizes HTTP 404 metadata", () => {
        expect(isS3MissingObjectError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    });

    it("does not treat 403 as missing", () => {
        expect(isS3MissingObjectError({ name: "Unknown", $metadata: { httpStatusCode: 403 } })).toBe(false);
    });
});
