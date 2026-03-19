import { describe, expect, it } from "vitest";

import type {
  GameObjectView,
  OpponentView,
  PlayerGameView,
  PlayerView,
  StackItemView,
  ZoneView
} from "../../src/index";

describe("view/types", () => {
  it("exports player-facing view types from the package root", () => {
    const handObject: GameObjectView = {
      id: "obj-1",
      zcc: 0,
      cardDefId: "island",
      owner: "player-1",
      controller: "player-1",
      counters: { charge: 1 },
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      zone: { kind: "hand", scope: "player", playerId: "player-1" }
    };
    const viewer: PlayerView = {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [handObject],
      handCount: 1
    };
    const opponent: OpponentView = {
      id: "player-2",
      life: 18,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 2
    };
    const zones: ZoneView[] = [
      {
        zoneRef: { kind: "battlefield", scope: "shared" },
        objectIds: ["obj-9"],
        count: 1
      },
      {
        zoneRef: { kind: "library", scope: "player", playerId: "player-2" },
        count: 30
      }
    ];
    const stack: StackItemView[] = [
      {
        object: { id: "obj-5", zcc: 0 },
        controller: "player-1"
      }
    ];
    const view: PlayerGameView = {
      viewerPlayerId: "player-1",
      stateVersion: 3,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer,
      opponent,
      zones,
      objectPool: {
        "obj-1": handObject
      },
      stack,
      pendingChoice: null,
      legalActions: {
        passPriority: null,
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {}
      }
    };

    expect(view.viewer.hand[0]?.cardDefId).toBe("island");
    expect(view.opponent.handCount).toBe(2);
    expect(view.zones[1]?.count).toBe(30);
    expect(view.stack[0]?.object.id).toBe("obj-5");
  });
});
