import { describe, expect, it } from "vitest";
import { gameinfo, GameFactory } from "@abstractplay/gameslib";
import { addPrefix, render } from "@abstractplay/renderer";

describe("thumbnail pipeline package interop", () => {
    it("loads gameslib via ESM import", () => {
        expect(gameinfo).toBeTruthy();
        expect(typeof GameFactory).toBe("function");
    });

    it("exposes renderer addPrefix and render", () => {
        expect(typeof addPrefix).toBe("function");
        expect(typeof render).toBe("function");
    });
});
