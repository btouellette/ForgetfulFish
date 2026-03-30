import { describe, expect, it } from "vitest";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { getAutoTapHandActions, getAutoTapPlan } from "./auto-tapper";

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
  overrides: Partial<PlayerGameView["viewer"]["hand"][number]> = {}
): PlayerGameView["viewer"]["hand"][number] {
  return {
    id,
    zcc: 0,
    cardDefId,
    name: cardDefId,
    manaCost: {},
    rulesText: "",
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    zone: { kind: "hand", scope: "player", playerId: "player-1" },
    ...overrides
  };
}

function createBattlefieldObject(
  id: string,
  cardDefId: string,
  tapped = false
): PlayerGameView["objectPool"][string] {
  return {
    id,
    zcc: 0,
    cardDefId,
    name: cardDefId,
    rulesText: "",
    owner: "player-1",
    controller: "player-1",
    counters: {},
    damage: 0,
    tapped,
    summoningSick: false,
    attachments: [],
    zone: { kind: "battlefield", scope: "player", playerId: "player-1" }
  };
}

describe("auto-tapper helper", () => {
  it("marks a spell as auto-tap castable when untapped lands can cover its cost", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [createCard("spell-1", "brainstorm", { manaCost: { blue: 1 } })],
        handCount: 1
      },
      objectPool: {
        island: createBattlefieldObject("island", "island")
      },
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

    expect(getAutoTapHandActions(gameView)).toEqual({
      "spell-1": { requiresTargets: false }
    });
    expect(getAutoTapPlan(gameView, "spell-1")).toEqual({
      requiresTargets: false,
      activations: [{ sourceId: "island", abilityIndex: 0 }]
    });
  });

  it("preserves targeted-spell metadata in the auto-tap plan", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [createCard("spell-1", "memory-lapse", { manaCost: { blue: 1, generic: 1 } })],
        handCount: 1
      },
      objectPool: {
        "stack-spell": {
          id: "stack-spell",
          zcc: 0,
          cardDefId: "brainstorm",
          name: "Brainstorm",
          rulesText: "",
          owner: "player-2",
          controller: "player-2",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "stack", scope: "shared" }
        },
        islandA: createBattlefieldObject("islandA", "island"),
        islandB: createBattlefieldObject("islandB", "island")
      },
      stack: [{ object: { id: "stack-spell", zcc: 0 }, controller: "player-2" }],
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {
          islandA: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "islandA", abilityIndex: 0 },
              requiresTargets: false,
              isManaAbility: true,
              manaProduced: { blue: 1 },
              blocksAutoPass: false
            }
          ],
          islandB: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "islandB", abilityIndex: 0 },
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

    expect(getAutoTapPlan(gameView, "spell-1")).toEqual({
      requiresTargets: true,
      activations: [
        { sourceId: "islandA", abilityIndex: 0 },
        { sourceId: "islandB", abilityIndex: 0 }
      ]
    });
  });

  it("does not advertise auto-tap for targeted spells when no stack target exists", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [createCard("spell-1", "memory-lapse", { manaCost: { blue: 1, generic: 1 } })],
        handCount: 1
      },
      objectPool: {
        islandA: createBattlefieldObject("islandA", "island"),
        islandB: createBattlefieldObject("islandB", "island")
      },
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield: {
          islandA: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "islandA", abilityIndex: 0 },
              requiresTargets: false,
              isManaAbility: true,
              manaProduced: { blue: 1 },
              blocksAutoPass: false
            }
          ],
          islandB: [
            {
              type: "ACTIVATE_ABILITY",
              commandBase: { type: "ACTIVATE_ABILITY", sourceId: "islandB", abilityIndex: 0 },
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

    expect(getAutoTapHandActions(gameView)).toEqual({});
    expect(getAutoTapPlan(gameView, "spell-1")).toBeNull();
  });

  it("caps auto-tap search work for large battlefields", () => {
    const battlefield: PlayerGameView["legalActions"]["battlefield"] = {};
    const objectPool: PlayerGameView["objectPool"] = {};

    for (let index = 0; index < 9; index += 1) {
      const sourceId = `island-${index}`;
      objectPool[sourceId] = createBattlefieldObject(sourceId, "island");
      battlefield[sourceId] = [
        {
          type: "ACTIVATE_ABILITY",
          commandBase: { type: "ACTIVATE_ABILITY", sourceId, abilityIndex: 0 },
          requiresTargets: false,
          isManaAbility: true,
          manaProduced: { blue: 1 },
          blocksAutoPass: false
        },
        {
          type: "ACTIVATE_ABILITY",
          commandBase: { type: "ACTIVATE_ABILITY", sourceId, abilityIndex: 1 },
          requiresTargets: false,
          isManaAbility: true,
          manaProduced: { colorless: 1 },
          blocksAutoPass: false
        }
      ];
    }

    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [createCard("spell-1", "predict", { manaCost: { red: 1, generic: 8 } })],
        handCount: 1
      },
      objectPool,
      legalActions: {
        passPriority: { command: { type: "PASS_PRIORITY" } },
        concede: { command: { type: "CONCEDE" } },
        choice: null,
        hand: {},
        battlefield,
        hasOtherBlockingActions: false
      }
    });

    expect(getAutoTapPlan(gameView, "spell-1")).toBeNull();
  });

  it("does not mark a spell as auto-tap castable when required mana sources are tapped", () => {
    const gameView = createGameView({
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [createCard("spell-1", "brainstorm", { manaCost: { blue: 1 } })],
        handCount: 1
      },
      objectPool: {
        island: createBattlefieldObject("island", "island", true)
      },
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

    expect(getAutoTapHandActions(gameView)).toEqual({});
    expect(getAutoTapPlan(gameView, "spell-1")).toBeNull();
  });
});
