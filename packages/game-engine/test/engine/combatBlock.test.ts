import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { AbilityAst } from "../../src/cards/abilityAst";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { addContinuousEffect, LAYERS } from "../../src/effects/continuous/layers";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const testCreatureDefinition: CardDefinition = {
  id: "combat-block-test-creature",
  name: "Combat Block Test Creature",
  manaCost: { blue: 1 },
  rulesText: "",
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: ["blue"],
  supertypes: [],
  power: 2,
  toughness: 2,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const testSwampDefinition: CardDefinition = {
  id: "combat-block-test-swamp",
  name: "Combat Block Test Swamp",
  manaCost: {},
  rulesText: "",
  typeLine: ["Land"],
  subtypes: [{ kind: "basic_land_type", value: "Swamp" }],
  color: [],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function makeCard(
  id: string,
  cardDefId: string,
  owner: "p1" | "p2",
  zone: GameObject["zone"],
  abilities: AbilityAst[] = []
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities,
    zone
  };
}

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function setDeclareBlockersPriority(state: GameState): void {
  state.turnState.phase = "DECLARE_BLOCKERS";
  state.turnState.step = "DECLARE_BLOCKERS";
  state.turnState.activePlayerId = "p1";
  state.turnState.priorityState = createInitialPriorityState("p2");
  state.players[0].priority = false;
  state.players[1].priority = true;
}

function createBlockState(): GameState {
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
  cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);
  cardRegistry.set(testSwampDefinition.id, testSwampDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "combat-block-test",
    rngSeed: "combat-block-seed"
  });
  setDeclareBlockersPriority(state);

  return state;
}

describe("engine/combatBlock", () => {
  it("accepts and persists a legal single-blocker assignment", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-blocker", testCreatureDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.turnState.attackers = ["obj-attacker"];

    const result = processCommand(
      state,
      {
        type: "DECLARE_BLOCKERS",
        assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.turnState.blockers).toEqual([
      { attackerId: "obj-attacker", blockerId: "obj-blocker" }
    ]);
    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });

  it("rejects DECLARE_BLOCKERS when the blocker is tapped", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      { ...makeCard("obj-blocker", testCreatureDefinition.id, "p2", { kind: "battlefield", scope: "shared" }), tapped: true }
    );
    state.turnState.attackers = ["obj-attacker"];

    expect(() =>
      processCommand(
        state,
        {
          type: "DECLARE_BLOCKERS",
          assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
        },
        new Rng(state.rngSeed)
      )
    ).toThrow();
  });

  it("rejects DECLARE_BLOCKERS when the blocker is not on the battlefield", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.objectPool.set(
      "obj-hand-blocker",
      makeCard("obj-hand-blocker", testCreatureDefinition.id, "p2", {
        kind: "hand",
        scope: "player",
        playerId: "p2"
      })
    );
    state.turnState.attackers = ["obj-attacker"];

    expect(() =>
      processCommand(
        state,
        {
          type: "DECLARE_BLOCKERS",
          assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-hand-blocker"] }]
        },
        new Rng(state.rngSeed)
      )
    ).toThrow();
  });

  it("rejects duplicate blocker assignments across attackers", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker-a", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-attacker-b", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-blocker", testCreatureDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.turnState.attackers = ["obj-attacker-a", "obj-attacker-b"];

    expect(() =>
      processCommand(
        state,
        {
          type: "DECLARE_BLOCKERS",
          assignments: [
            { attackerId: "obj-attacker-a", blockerIds: ["obj-blocker"] },
            { attackerId: "obj-attacker-b", blockerIds: ["obj-blocker"] }
          ]
        },
        new Rng(state.rngSeed)
      )
    ).toThrow();
  });

  it("enforces islandwalk so Dandan cannot be blocked when the defender controls an Island", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", dandanCardDefinition.id, "p1", { kind: "battlefield", scope: "shared" })
    );
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );
    putOnBattlefield(
      state,
      makeCard("obj-blocker", testCreatureDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.turnState.attackers = ["obj-attacker"];

    expect(() =>
      processCommand(
        state,
        {
          type: "DECLARE_BLOCKERS",
          assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
        },
        new Rng(state.rngSeed)
      )
    ).toThrow();
  });

  it("allows a Mind-Bent swampwalk attacker to be blocked when the defender controls no Swamps", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", dandanCardDefinition.id, "p1", { kind: "battlefield", scope: "shared" })
    );
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );
    putOnBattlefield(
      state,
      makeCard("obj-blocker", testCreatureDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.turnState.attackers = ["obj-attacker"];

    const withTextChange = addContinuousEffect(state, {
      id: "effect-mind-bend-landwalk",
      source: { id: "obj-attacker", zcc: 0 },
      layer: LAYERS.TEXT,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-attacker", zcc: 0 } },
      effect: {
        kind: "text_change",
        payload: { fromLandType: "Island", toLandType: "Swamp" }
      }
    });

    const result = processCommand(
      withTextChange,
      {
        type: "DECLARE_BLOCKERS",
        assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
      },
      new Rng(withTextChange.rngSeed)
    );

    expect(result.nextState.turnState.blockers).toEqual([
      { attackerId: "obj-attacker", blockerId: "obj-blocker" }
    ]);
  });

  it("allows a blocker with reach to block a flying attacker", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard(
        "obj-attacker",
        testCreatureDefinition.id,
        "p1",
        { kind: "battlefield", scope: "shared" },
        [{ kind: "keyword", keyword: "flying" }]
      )
    );
    putOnBattlefield(
      state,
      makeCard(
        "obj-blocker",
        testCreatureDefinition.id,
        "p2",
        { kind: "battlefield", scope: "shared" },
        [{ kind: "keyword", keyword: "reach" }]
      )
    );
    state.turnState.attackers = ["obj-attacker"];

    const result = processCommand(
      state,
      {
        type: "DECLARE_BLOCKERS",
        assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.turnState.blockers).toEqual([
      { attackerId: "obj-attacker", blockerId: "obj-blocker" }
    ]);
  });

  it("resets the post-blockers priority window to the active player", () => {
    const state = createBlockState();
    putOnBattlefield(
      state,
      makeCard("obj-attacker", testCreatureDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-blocker", testCreatureDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    state.turnState.attackers = ["obj-attacker"];

    const result = processCommand(
      state,
      {
        type: "DECLARE_BLOCKERS",
        assignments: [{ attackerId: "obj-attacker", blockerIds: ["obj-blocker"] }]
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.turnState.priorityState.playerWithPriority).toBe("p1");
    expect(result.nextState.players[0]?.priority).toBe(true);
    expect(result.nextState.players[1]?.priority).toBe(false);
  });
});
