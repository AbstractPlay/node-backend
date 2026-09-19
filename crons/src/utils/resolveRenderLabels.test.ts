import { describe, expect, it, beforeAll } from "vitest";
import { addResource } from "@abstractplay/gameslib";
import type { APRenderRep } from "@abstractplay/renderer";
import enApgames from "@abstractplay/gameslib/locales/en/apgames.json";
import enApresults from "@abstractplay/gameslib/locales/en/apresults.json";
import { resolveRenderLabels } from "./resolveRenderLabels.js";

describe("resolveRenderLabels", () => {
    const players = [
        { name: "Alice" },
        { name: "Bob" },
    ];

    const t = (key: string, params?: Record<string, unknown>) => {
        if (key === "test:STASH") {
            return `${params?.player}'s stash`;
        }
        return key;
    };

    it("resolves structured area labels to display names", () => {
        const rep = {
            areas: [
                {
                    type: "pieces",
                    label: {
                        textKey: "test:STASH",
                        actor: { kind: "seat", seat: 2 },
                    },
                    pieces: ["A1"],
                },
            ],
            legend: { A1: "piece" },
        } as unknown as APRenderRep;
        const resolved = resolveRenderLabels(rep, players, t);
        expect((resolved.areas![0] as { label: string }).label).toBe("Bob's stash");
    });

    it("leaves plain-string labels unchanged", () => {
        const rep = {
            areas: [
                {
                    type: "pieces",
                    label: "Player 1 hand",
                    pieces: ["A1"],
                },
            ],
        } as unknown as APRenderRep;
        const resolved = resolveRenderLabels(rep, players, t);
        expect((resolved.areas![0] as { label: string }).label).toBe("Player 1 hand");
    });

    it("resolves streetcar-style taken area labels", () => {
        const rep = {
            areas: [
                {
                    type: "pieces",
                    label: {
                        textKey: "apgames:validation.streetcar.TAKEN_LABEL",
                        actor: { kind: "seat", seat: 1 },
                    },
                    pieces: ["E"],
                },
            ],
        } as unknown as APRenderRep;
        const streetcarT = (key: string, params?: Record<string, unknown>) => {
            if (key === "apgames:validation.streetcar.TAKEN_LABEL") {
                return `${params?.player}'s housing limits`;
            }
            return key;
        };
        const resolved = resolveRenderLabels(rep, players, streetcarT);
        expect((resolved.areas![0] as { label: string }).label).toBe("Alice's housing limits");
    });

    it("resolves entropy board labels and board markers", () => {
        const rep = {
            board: {
                style: "squares",
                boardOne: {
                    label: {
                        textKey: "test:STASH",
                        actor: { kind: "seat", seat: 1 },
                    },
                },
                markers: [
                    {
                        type: "label",
                        label: {
                            textKey: "test:STASH",
                            actor: { kind: "seat", seat: 2 },
                        },
                        points: [
                            { row: 0, col: 0 },
                            { row: 0, col: 1 },
                        ],
                    },
                ],
            },
        } as unknown as APRenderRep;
        const resolved = resolveRenderLabels(rep, players, t);
        const board = resolved.board as {
            boardOne: { label: string };
            markers: { label: string }[];
        };
        expect(board.boardOne.label).toBe("Alice's stash");
        expect(board.markers[0].label).toBe("Bob's stash");
    });

    it("resolves structured labels in every multiframe render rep", () => {
        const stashLabel = {
            textKey: "test:STASH",
            actor: { kind: "seat", seat: 1 },
        };
        const frame = {
            areas: [
                {
                    type: "pieces",
                    label: stashLabel,
                    pieces: ["A1"],
                },
            ],
        } as unknown as APRenderRep;
        const rep = [structuredClone(frame), structuredClone(frame)] as APRenderRep[];
        const resolved = resolveRenderLabels(rep, players, t);
        expect(Array.isArray(resolved)).toBe(true);
        for (const item of resolved as APRenderRep[]) {
            expect((item.areas![0] as { label: string }).label).toBe("Alice's stash");
        }
    });

    describe("with real apgames bundle", () => {
        beforeAll(async () => {
            addResource("en", undefined, {
                bundles: { apgames: enApgames, apresults: enApresults },
            });
        });

        it("resolves streetcar TAKEN_LABEL via i18next", () => {
            const gamesI18n = addResource("en", undefined, {
                bundles: { apgames: enApgames, apresults: enApresults },
            });
            const rep = {
                areas: [
                    {
                        type: "pieces",
                        label: {
                            textKey: "apgames:validation.streetcar.TAKEN_LABEL",
                            actor: { kind: "seat", seat: 1 },
                        },
                        pieces: ["E"],
                    },
                ],
            } as unknown as APRenderRep;
            const resolved = resolveRenderLabels(rep, players, (key, params) =>
                String(gamesI18n.t(key, params ?? {})),
            );
            expect((resolved.areas![0] as { label: string }).label).toBe("Alice's housing limits");
        });

        it("resolves rincala LABEL_STASH on multiframe reps via i18next", () => {
            const gamesI18n = addResource("en", undefined, {
                bundles: { apgames: enApgames, apresults: enApresults },
            });
            const stashLabel = {
                textKey: "apgames:validation.rincala.LABEL_STASH",
                actor: { kind: "seat", seat: 2 },
            };
            const frame = {
                areas: [
                    {
                        type: "pieces",
                        label: stashLabel,
                        pieces: ["Y"],
                    },
                ],
            } as unknown as APRenderRep;
            const resolved = resolveRenderLabels([frame, structuredClone(frame)], players, (key, params) =>
                String(gamesI18n.t(key, params ?? {})),
            );
            const frames = resolved as APRenderRep[];
            expect(frames).toHaveLength(2);
            const label = (frames[1].areas![0] as { label: string }).label;
            expect(label).not.toContain("apgames:");
            expect(label).not.toBe("apgames:validation.rincala.LABEL_STASH");
        });
    });
});
