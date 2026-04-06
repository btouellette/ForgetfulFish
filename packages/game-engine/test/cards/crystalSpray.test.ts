import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { AbilityAst } from "../../src/cards/abilityAst";
import { crystalSprayCardDefinition } from "../../src/cards/crystal-spray";
import { processCommand } from "../../src/engine/processCommand";
import { advanceStepWithEvents } from "../../src/engine/kernel";
import { computeGameObject, LAYERS } from "../../src/effects/continuous/layers";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

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

function setMainPhasePriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = playerId;
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function setMana(state: GameState, playerId: "p1" | "p2", blue: number, colorless: number): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue, colorless };
}

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function addToSharedLibrary(state: GameState, object: GameObject): void {
  const libraryKey = zoneKey({ kind: "library", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(libraryKey, [...(state.zones.get(libraryKey) ?? []), object.id]);
}

function passPriorityPair(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(
    pass1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(pass1.nextState.rngSeed)
  );
}

function createCrystalSprayState(): GameState {
  cardRegistry.set(crystalSprayCardDefinition.id, crystalSprayCardDefinition);
  const state = createInitialGameState("p1", "p2", {
    id: "crystal-spray-test",
    rngSeed: "crystal-spray-seed"
  });
  setMainPhasePriority(state, "p1");
  setMana(state, "p1", 1, 2);

  putInHand(
    state,
    "p1",
    makeCard("obj-crystal-spray", crystalSprayCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );
  putOnBattlefield(
    state,
    makeCard("obj-target", "memory-lapse", "p2", { kind: "battlefield", scope: "shared" }, [
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ])
  );
  addToSharedLibrary(
    state,
    makeCard("obj-draw-card", "island", "p1", { kind: "library", scope: "shared" })
  );

  return state;
}

describe("cards/crystal-spray", () => {
  it("loads as a three-mana blue instant", () => {
    expect(crystalSprayCardDefinition.id).toBe("crystal-spray");
    expect(crystalSprayCardDefinition.manaCost).toEqual({ blue: 1, generic: 2 });
    expect(crystalSprayCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast targeting a battlefield permanent", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );

    const top = cast.nextState.stack[cast.nextState.stack.length - 1];
    expect(top?.object.id).toBe("obj-crystal-spray");
    expect(top?.targets[0]).toEqual({ kind: "object", object: { id: "obj-target", zcc: 0 } });
  });

  it("prompts for one specific land-type instance on resolution", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (resolved.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected CHOOSE_MODE pending choice");
    }

    expect(resolved.pendingChoice.constraints.modes).toEqual([
      { id: "keyword:landwalk", label: "Island (landwalk)" },
      { id: "static:cant_attack_unless", label: "Island (attack restriction)" },
      { id: "static:when_no_islands_sacrifice", label: "Island (sacrifice restriction)" }
    ]);
  });

  it("excludes the chosen source land type from the replacement choice", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseInstance = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_MODE",
          mode: { id: "static:cant_attack_unless" }
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );

    expect(chooseInstance.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (chooseInstance.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected replacement CHOOSE_MODE pending choice");
    }
    expect(chooseInstance.pendingChoice.constraints.modes).toEqual([
      { id: "Plains", label: "Plains" },
      { id: "Swamp", label: "Swamp" },
      { id: "Mountain", label: "Mountain" },
      { id: "Forest", label: "Forest" }
    ]);
  });

  it("changes only the selected instance, draws a card, and creates an until-end-of-turn effect", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseInstance = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_MODE",
          mode: { id: "static:cant_attack_unless" }
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const chooseTo = processCommand(
      chooseInstance.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Mountain" } } },
      new Rng(chooseInstance.nextState.rngSeed)
    );

    expect(
      chooseTo.nextState.continuousEffects.some(
        (effect) =>
          effect.layer === LAYERS.TEXT &&
          effect.duration === "until_end_of_turn" &&
          effect.appliesTo.kind === "object" &&
          effect.appliesTo.object.id === "obj-target" &&
          effect.effect.kind === "text_change" &&
          effect.effect.payload?.fromLandType === "Island" &&
          effect.effect.payload?.toLandType === "Mountain" &&
          effect.effect.payload?.instanceId === "static:cant_attack_unless"
      )
    ).toBe(true);
    expect(
      chooseTo.newEvents.filter((event) => event.type === "CARD_DRAWN" && event.playerId === "p1")
    ).toHaveLength(1);
    expect(computeGameObject("obj-target", chooseTo.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Mountain" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ]);
    expect(() => assertStateInvariants(chooseTo.nextState)).not.toThrow();
  });

  it("expires the text change at cleanup while keeping the drawn card", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseInstance = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_MODE",
          mode: { id: "static:cant_attack_unless" }
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const chooseTo = processCommand(
      chooseInstance.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Mountain" } } },
      new Rng(chooseInstance.nextState.rngSeed)
    );
    const cleanupState: GameState = {
      ...chooseTo.nextState,
      turnState: {
        ...chooseTo.nextState.turnState,
        phase: "CLEANUP",
        step: "CLEANUP"
      }
    };

    const nextTurnState = advanceStepWithEvents(cleanupState, new Rng(cleanupState.rngSeed)).state;

    expect(nextTurnState.continuousEffects).toHaveLength(0);
    expect(computeGameObject("obj-target", nextTurnState).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ]);
    expect(nextTurnState.players[0].hand).toContain("obj-draw-card");
  });

  it("still draws a card when the target has no supported land-type instances", () => {
    const state = createCrystalSprayState();
    state.objectPool.set(
      "obj-target",
      makeCard("obj-target", "memory-lapse", "p2", { kind: "battlefield", scope: "shared" }, [
        { kind: "keyword", keyword: "flying" }
      ])
    );

    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.nextState.continuousEffects).toHaveLength(0);
    expect(
      resolved.newEvents.filter((event) => event.type === "CARD_DRAWN" && event.playerId === "p1")
    ).toHaveLength(1);
    expect(computeGameObject("obj-target", resolved.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "flying" }
    ]);
    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });

  it("can target a trigger-condition instance specifically", () => {
    const state = createCrystalSprayState();
    state.objectPool.set(
      "obj-target",
      makeCard("obj-target", "memory-lapse", "p2", { kind: "battlefield", scope: "shared" }, [
        {
          kind: "trigger",
          event: "CUSTOM_EVENT",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        }
      ])
    );

    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseInstance = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_MODE",
          mode: { id: "trigger:CUSTOM_EVENT:condition" }
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const chooseTo = processCommand(
      chooseInstance.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Mountain" } } },
      new Rng(chooseInstance.nextState.rngSeed)
    );

    expect(computeGameObject("obj-target", chooseTo.nextState).abilities).toEqual([
      {
        kind: "trigger",
        event: "CUSTOM_EVENT",
        condition: { kind: "defender_controls_land_type", landType: "Mountain" }
      },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      }
    ]);
  });

  it("treats a stale chosen instance as a no-op while still drawing a card", () => {
    const state = createCrystalSprayState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);

    const staleState: GameState = {
      ...firstResolve.nextState,
      objectPool: new Map(firstResolve.nextState.objectPool)
    };
    const staleTarget = staleState.objectPool.get("obj-target");
    if (staleTarget === undefined) {
      throw new Error("expected obj-target in stale state");
    }
    staleState.objectPool.set("obj-target", {
      ...staleTarget,
      abilities: [{ kind: "keyword", keyword: "flying" }]
    });

    const chooseStaleInstance = processCommand(
      staleState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_MODE",
          mode: { id: "static:cant_attack_unless" }
        }
      },
      new Rng(staleState.rngSeed)
    );

    expect(chooseStaleInstance.pendingChoice).toBeNull();
    expect(chooseStaleInstance.nextState.continuousEffects).toHaveLength(0);
    expect(
      chooseStaleInstance.newEvents.filter(
        (event) => event.type === "CARD_DRAWN" && event.playerId === "p1"
      )
    ).toHaveLength(1);
  });
});
