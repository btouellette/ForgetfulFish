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

const testSwampDefinition: CardDefinition = {
  id: "combat-attack-test-swamp",
  name: "Combat Attack Test Swamp",
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

function setDeclareAttackersPriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "DECLARE_ATTACKERS";
  state.turnState.step = "DECLARE_ATTACKERS";
  state.turnState.activePlayerId = playerId;
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function createAttackState(): GameState {
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
  cardRegistry.set(testSwampDefinition.id, testSwampDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "combat-attack-test",
    rngSeed: "combat-attack-seed"
  });
  setDeclareAttackersPriority(state, "p1");

  putOnBattlefield(
    state,
    makeCard("obj-attacker", dandanCardDefinition.id, "p1", {
      kind: "battlefield",
      scope: "shared"
    })
  );
  putOnBattlefield(
    state,
    makeCard("obj-controller-island", "island", "p1", { kind: "battlefield", scope: "shared" })
  );

  return state;
}

describe("engine/combatAttack", () => {
  it("allows Dandan to attack when the defending player controls an Island", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );

    const result = processCommand(
      state,
      { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.turnState.attackers).toEqual(["obj-attacker"]);
  });

  it("rejects Dandan as an attacker when the defending player controls no Island-equivalent land type", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-swamp", testSwampDefinition.id, "p2", {
        kind: "battlefield",
        scope: "shared"
      })
    );

    expect(() =>
      processCommand(
        state,
        { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
        new Rng(state.rngSeed)
      )
    ).toThrow("declared attackers must be legal attackers");
  });

  it("uses computed-view control changes when declaring attackers", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-owned-island", "island", "p1", { kind: "battlefield", scope: "shared" })
    );

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-give-opponent-island",
      source: { id: "obj-owned-island", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-owned-island", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });

    const result = processCommand(
      withControlEffect,
      { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
      new Rng(withControlEffect.rngSeed)
    );

    expect(result.nextState.turnState.attackers).toEqual(["obj-attacker"]);
  });

  it("uses computed-view type changes when rejecting attackers", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );

    const withTypeChange = addContinuousEffect(state, {
      id: "effect-remove-island-subtype",
      source: { id: "obj-attacker", zcc: 0 },
      layer: LAYERS.TYPE,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-defender-island", zcc: 0 } },
      effect: {
        kind: "type_change",
        payload: { typeLine: ["Land"], subtypes: [{ kind: "other", value: "Desert" }] }
      }
    });

    expect(() =>
      processCommand(
        withTypeChange,
        { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
        new Rng(withTypeChange.rngSeed)
      )
    ).toThrow("declared attackers must be legal attackers");
  });

  it("rejects tapped or summoning-sick creatures as attackers", () => {
    const tappedState = createAttackState();
    putOnBattlefield(
      tappedState,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );
    const tappedAttacker = tappedState.objectPool.get("obj-attacker");
    if (tappedAttacker === undefined) {
      throw new Error("expected attacker to exist");
    }
    tappedState.objectPool.set("obj-attacker", { ...tappedAttacker, tapped: true });

    expect(() =>
      processCommand(
        tappedState,
        { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
        new Rng(tappedState.rngSeed)
      )
    ).toThrow("declared attackers must be legal attackers");

    const summoningSickState = createAttackState();
    putOnBattlefield(
      summoningSickState,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );
    const summoningSickAttacker = summoningSickState.objectPool.get("obj-attacker");
    if (summoningSickAttacker === undefined) {
      throw new Error("expected attacker to exist");
    }
    summoningSickState.objectPool.set("obj-attacker", {
      ...summoningSickAttacker,
      summoningSick: true
    });

    expect(() =>
      processCommand(
        summoningSickState,
        { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
        new Rng(summoningSickState.rngSeed)
      )
    ).toThrow("declared attackers must be legal attackers");
  });

  it("enforces must-attack creatures that are able to attack", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );
    const withMustAttack = addContinuousEffect(state, {
      id: "must-attack-effect",
      source: { id: "obj-attacker", zcc: 0 },
      layer: LAYERS.ABILITY,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-attacker", zcc: 0 } },
      effect: { kind: "must_attack" }
    });

    expect(() =>
      processCommand(
        withMustAttack,
        { type: "DECLARE_ATTACKERS", attackers: [] },
        new Rng(withMustAttack.rngSeed)
      )
    ).toThrow("must-attack creatures that are able to attack must be declared as attackers");
  });

  it("emits a dedicated declare-attackers event and resets priority to the active player", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );

    const result = processCommand(
      state,
      { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
      new Rng(state.rngSeed)
    );

    expect(result.newEvents).toContainEqual(
      expect.objectContaining({
        type: "DECLARE_ATTACKERS",
        controller: "p1",
        attackers: [{ id: "obj-attacker", zcc: 0 }]
      })
    );
    expect(result.nextState.turnState.priorityState.playerWithPriority).toBe("p1");
    expect(result.nextState.players[0]?.priority).toBe(true);
    expect(result.nextState.players[1]?.priority).toBe(false);
  });

  it("preserves state invariants after attackers are declared", () => {
    const state = createAttackState();
    putOnBattlefield(
      state,
      makeCard("obj-defender-island", "island", "p2", { kind: "battlefield", scope: "shared" })
    );

    const result = processCommand(
      state,
      { type: "DECLARE_ATTACKERS", attackers: ["obj-attacker"] },
      new Rng(state.rngSeed)
    );

    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });
});
