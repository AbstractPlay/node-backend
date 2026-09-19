import {
    isStructuredRenderLabel,
    resolveRenderLabel,
    type ChatLogTranslate,
    type RenderLabel,
} from "@abstractplay/gameslib";
import type { APRenderRep } from "@abstractplay/renderer";
import type { ThumbnailRenderOutput } from "./thumbnailRenderRep.js";

type ThumbnailPlayer = {
    name: string;
};

type LabelHost = {
    label?: RenderLabel;
    type?: string;
    buttons?: { label?: RenderLabel }[];
};

type BoardHost = {
    boardOne?: { label?: RenderLabel };
    boardTwo?: { label?: RenderLabel };
    markers?: { type?: string; label?: RenderLabel }[];
};

function resolveLabelField(
    label: RenderLabel,
    playerNames: string[],
    t: ChatLogTranslate,
): string | RenderLabel {
    if (!isStructuredRenderLabel(label)) {
        return label;
    }
    return resolveRenderLabel(label, playerNames, t);
}

function walkMarkers(
    markers: BoardHost["markers"],
    playerNames: string[],
    t: ChatLogTranslate,
): void {
    if (!Array.isArray(markers)) {
        return;
    }
    for (const marker of markers) {
        if (marker?.type === "label" && marker.label !== undefined) {
            marker.label = resolveLabelField(marker.label, playerNames, t);
        }
    }
}

function walkAreas(
    areas: LabelHost[] | undefined,
    playerNames: string[],
    t: ChatLogTranslate,
): void {
    if (!Array.isArray(areas)) {
        return;
    }
    for (const area of areas) {
        if (area?.label !== undefined) {
            area.label = resolveLabelField(area.label, playerNames, t);
        }
        if (area?.type === "buttonBar" && Array.isArray(area.buttons)) {
            for (const button of area.buttons) {
                if (button?.label !== undefined) {
                    button.label = resolveLabelField(button.label, playerNames, t);
                }
            }
        }
    }
}

function walkBoard(
    board: BoardHost | null | undefined,
    playerNames: string[],
    t: ChatLogTranslate,
): void {
    if (!board || typeof board !== "object") {
        return;
    }
    if (board.boardOne?.label !== undefined) {
        board.boardOne.label = resolveLabelField(board.boardOne.label, playerNames, t);
    }
    if (board.boardTwo?.label !== undefined) {
        board.boardTwo.label = resolveLabelField(board.boardTwo.label, playerNames, t);
    }
    walkMarkers(board.markers, playerNames, t);
}

function resolveRenderLabelsOne(
    rep: APRenderRep,
    playerNames: string[],
    t: ChatLogTranslate,
): APRenderRep {
    if (!rep || typeof rep !== "object" || Array.isArray(rep)) {
        return rep;
    }
    const out = structuredClone(rep);
    walkBoard(out.board as BoardHost | null | undefined, playerNames, t);
    walkAreas(out.areas as LabelHost[] | undefined, playerNames, t);
    return out;
}

/** Resolve structured render labels to display strings before thumbnail SVG rendering. */
export function resolveRenderLabels(
    rep: ThumbnailRenderOutput,
    players: ThumbnailPlayer[],
    t: ChatLogTranslate,
): ThumbnailRenderOutput {
    const playerNames = players.map((p) => p.name);
    if (Array.isArray(rep)) {
        return rep.map((frame) => resolveRenderLabelsOne(frame, playerNames, t));
    }
    return resolveRenderLabelsOne(rep, playerNames, t);
}
