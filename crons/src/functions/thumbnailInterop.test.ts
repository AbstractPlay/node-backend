import { describe, expect, it } from "vitest";
import { gameinfo, GameFactory } from "@abstractplay/gameslib";
import { addPrefix, render, renderComposite } from "@abstractplay/renderer";

describe("thumbnail pipeline package interop", () => {
    it("loads gameslib via ESM import", () => {
        expect(gameinfo).toBeTruthy();
        expect(typeof GameFactory).toBe("function");
    });

    it("exposes renderer addPrefix, render, and renderComposite", () => {
        expect(typeof addPrefix).toBe("function");
        expect(typeof render).toBe("function");
        expect(typeof renderComposite).toBe("function");
    });
});
