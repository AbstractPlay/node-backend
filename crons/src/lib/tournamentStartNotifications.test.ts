import { describe, expect, it } from "vitest";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { enqueueTournamentStartNotifications } from "./tournamentStartNotifications.js";

type StoreItem = Record<string, unknown>;

function createMockClient(store: Map<string, StoreItem>) {
  return {
    async send(command: unknown) {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        if (key.pk === "BOT") {
          return {};
        }
        return {};
      }
      if (command instanceof PutCommand) {
        const item = command.input.Item as StoreItem;
        const pk = item.pk as string;
        const sk = item.sk as string;
        store.set(`${pk}:${sk}`, item);
        return {};
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    },
  };
}

describe("enqueueTournamentStartNotifications", () => {
  it("writes tournamentStart notifications for human players with default prefs", async () => {
    const store = new Map<string, StoreItem>();
    const client = createMockClient(store);

    await enqueueTournamentStartNotifications(
      client as never,
      "abstract-play-test",
      {
        id: "tour-1",
        metaGame: "go",
        number: 4,
        variants: ["small"],
      },
      ["user-a", "user-b"],
    );

    expect(store.size).toBe(2);
    for (const item of store.values()) {
      expect(item.body).toEqual({
        type: "tournamentStart",
        tournamentId: "tour-1",
        metaGame: "go",
        number: 4,
        variants: ["small"],
      });
    }
  });

  it("skips players who disabled tournamentStart in-app notifications", async () => {
    const store = new Map<string, StoreItem>();
    const client = createMockClient(store);
    const settingsByUserId = new Map([
      ["user-a", { all: { inAppNotifications: { tournamentStart: false } } }],
      ["user-b", undefined],
    ]);

    await enqueueTournamentStartNotifications(
      client as never,
      "abstract-play-test",
      {
        id: "tour-1",
        metaGame: "go",
        number: 4,
      },
      ["user-a", "user-b"],
      settingsByUserId,
    );

    expect(store.size).toBe(1);
    const item = [...store.values()][0];
    expect((item.pk as string).endsWith("user-b")).toBe(true);
  });
});
