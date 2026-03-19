import { describe, expect, it } from "vitest";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { assessAutoPass, shouldAutoPass } from "./auto-pass";

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  return {
    viewerPlayerId: "player-1",
    stateVersion: 1,
    turnState: {
      phase: "MAIN_1",
      activePlayerId: "player-1",
      priorityPlayerId: "player-1"
    },
    viewer: {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 0
    },
    zones: [],
    objectPool: {},
    stack: [],
    pendingChoice: null,
    ...overrides
  };
}

function createCard(
  id: string,
  cardDefId: string,
  zone: PlayerGameView["viewer"]["hand"][number]["zone"],
  overrides: Partial<PlayerGameView["viewer"]["hand"][number]> = {}
) {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    zone,
    ...overrides
  };
}

describe("auto-pass helper", () => {
  it("allows auto-pass when no visible actions are available", () => {
    expect(shouldAutoPass(createGameView())).toBe(true);
  });

  it("blocks auto-pass when a land is visible in hand", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          createCard("hand-island", "island", {
            kind: "hand",
            scope: "player",
            playerId: "player-1"
          })
        ],
        handCount: 1
      }
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("blocks auto-pass when an untapped Island enables a visible blue spell", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          createCard("spell-1", "brainstorm", {
            kind: "hand",
            scope: "player",
            playerId: "player-1"
          })
        ],
        handCount: 1
      },
      objectPool: {
        island: createCard("island", "island", { kind: "battlefield", scope: "shared" })
      }
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("allows auto-pass when the only Island is tapped", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          createCard("spell-1", "brainstorm", {
            kind: "hand",
            scope: "player",
            playerId: "player-1"
          })
        ],
        handCount: 1
      },
      objectPool: {
        island: createCard(
          "island",
          "island",
          { kind: "battlefield", scope: "shared" },
          { tapped: true }
        )
      }
    });

    expect(shouldAutoPass(gameView)).toBe(true);
  });

  it("allows auto-pass for memory-lapse when the stack is empty", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 2, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          createCard("spell-1", "memory-lapse", {
            kind: "hand",
            scope: "player",
            playerId: "player-1"
          })
        ],
        handCount: 1
      }
    });

    expect(shouldAutoPass(gameView)).toBe(true);
  });

  it("blocks auto-pass for memory-lapse when the stack is non-empty and mana is available", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 2, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          createCard("spell-1", "memory-lapse", {
            kind: "hand",
            scope: "player",
            playerId: "player-1"
          })
        ],
        handCount: 1
      },
      stack: [{ object: { id: "stack-1", zcc: 0 }, controller: "player-2" }]
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("fails closed for unknown hand cards", () => {
    const assessment = assessAutoPass(
      createGameView({
        viewer: {
          id: "player-1",
          life: 20,
          manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
          hand: [
            createCard("spell-1", "future-card", {
              kind: "hand",
              scope: "player",
              playerId: "player-1"
            })
          ],
          handCount: 1
        }
      })
    );

    expect(assessment).toEqual({ hasApparentAction: false, hasUncertainAction: true });
  });
});
