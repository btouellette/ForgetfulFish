import { describe, expect, it } from "vitest";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { assessAutoPass, shouldAutoPass } from "./auto-pass";

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  const baseView: PlayerGameView = {
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
    legalActions: {
      passPriority: { command: { type: "PASS_PRIORITY" } },
      concede: { command: { type: "CONCEDE" } },
      choice: null,
      hand: {},
      battlefield: {},
      hasOtherBlockingActions: false
    }
  };

  return {
    ...baseView,
    ...overrides,
    legalActions: overrides.legalActions ?? baseView.legalActions
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

  it("blocks auto-pass when a legal hand action is available", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {
          "hand-island": [
            { type: "PLAY_LAND", command: { type: "PLAY_LAND", cardId: "hand-island" } }
          ]
        },
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    expect(assessAutoPass(gameView)).toEqual({
      hasApparentAction: true,
      hasUncertainAction: false
    });
    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("allows auto-pass when only pass and concede exist", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    expect(shouldAutoPass(gameView)).toBe(true);
  });

  it("blocks auto-pass when a targeted spell is legal", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {
          "spell-1": [
            {
              type: "CAST_SPELL",
              commandBase: { type: "CAST_SPELL", cardId: "spell-1" },
              requiresTargets: true,
              availableModes: []
            }
          ]
        },
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("blocks auto-pass when a battlefield activation is legal", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {
          island: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "island", abilityIndex: 0 },
              requiresTargets: false,
              isManaAbility: true,
              manaProduced: { blue: 1 },
              blocksAutoPass: true
            }
          ]
        },
        hasOtherBlockingActions: false
      }
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });

  it("allows auto-pass when a mana-only battlefield activation is marked non-blocking", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {
          island: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "island", abilityIndex: 0 },
              requiresTargets: false,
              isManaAbility: true,
              manaProduced: { blue: 1 },
              blocksAutoPass: false
            }
          ]
        },
        hasOtherBlockingActions: false
      }
    });

    expect(shouldAutoPass(gameView)).toBe(true);
  });

  it("allows auto-pass when the player only has inert visible cards", () => {
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
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: false
      }
    });

    expect(shouldAutoPass(gameView)).toBe(true);
  });

  it("blocks auto-pass when the engine projects other blocking actions", () => {
    const gameView = createGameView({
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {},
        hasOtherBlockingActions: true
      }
    });

    expect(shouldAutoPass(gameView)).toBe(false);
  });
});
