import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { AbilityAst } from "../../src/cards/abilityAst";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { mindBendCardDefinition } from "../../src/cards/mind-bend";
import { crystalSprayCardDefinition } from "../../src/cards/crystal-spray";
import { processCommand } from "../../src/engine/processCommand";
import { computeGameObject } from "../../src/effects/continuous/layers";
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

function setBlueMana(state: GameState, playerId: "p1" | "p2", amount: number): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue: amount };
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

function passPriorityPair(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(
    pass1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(pass1.nextState.rngSeed)
  );
}

function createDandanCastState(): GameState {
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
  const state = createInitialGameState("p1", "p2", {
    id: "dandan-test",
    rngSeed: "dandan-seed"
  });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 2);

  putInHand(
    state,
    "p1",
    makeCard("obj-dandan", dandanCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );
  putOnBattlefield(
    state,
    makeCard("obj-support-island", "island", "p1", { kind: "battlefield", scope: "shared" })
  );

  return state;
}

describe("cards/dandan", () => {
  it("loads as a blue 4/1 creature", () => {
    expect(dandanCardDefinition.id).toBe("dandan");
    expect(dandanCardDefinition.manaCost).toEqual({ blue: 2 });
    expect(dandanCardDefinition.typeLine).toEqual(["Creature"]);
    expect(dandanCardDefinition.color).toEqual(["blue"]);
    expect(dandanCardDefinition.power).toBe(4);
    expect(dandanCardDefinition.toughness).toBe(1);
  });

  it("defines islandwalk and both static restrictions with structured land-type tokens", () => {
    expect(dandanCardDefinition.keywords).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" }
    ]);
    expect(dandanCardDefinition.staticAbilities).toEqual([
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
  });

  it("can be cast for {U}{U} and resolves onto the battlefield", () => {
    const state = createDandanCastState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-dandan", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    const object = resolved.nextState.objectPool.get("obj-dandan");
    expect(object?.zone).toEqual({ kind: "battlefield", scope: "shared" });
    expect(object?.controller).toBe("p1");
  });

  it("shows islandwalk and both static restrictions in the computed view after resolution", () => {
    const state = createDandanCastState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-dandan", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(computeGameObject("obj-dandan", resolved.nextState).abilities).toEqual([
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
    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });

  it("updates all three Island tokens when Mind Bend rewrites Dandan", () => {
    cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
    cardRegistry.set(mindBendCardDefinition.id, mindBendCardDefinition);
    const state = createInitialGameState("p1", "p2", {
      id: "dandan-mind-bend-test",
      rngSeed: "dandan-mind-bend-seed"
    });
    setMainPhasePriority(state, "p1");
    setBlueMana(state, "p1", 1);

    putOnBattlefield(
      state,
      makeCard("obj-dandan", dandanCardDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-support-island", "island", "p1", { kind: "battlefield", scope: "shared" })
    );
    putInHand(
      state,
      "p1",
      makeCard("obj-mind-bend", mindBendCardDefinition.id, "p1", {
        kind: "hand",
        scope: "player",
        playerId: "p1"
      })
    );

    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-dandan", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseFrom = processCommand(
      firstResolve.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Island" } } },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const chooseTo = processCommand(
      chooseFrom.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Swamp" } } },
      new Rng(chooseFrom.nextState.rngSeed)
    );

    expect(computeGameObject("obj-dandan", chooseTo.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Swamp" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Swamp"
      }
    ]);
  });

  it("updates only one Island token when Crystal Spray rewrites a single instance on Dandan", () => {
    cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
    cardRegistry.set(crystalSprayCardDefinition.id, crystalSprayCardDefinition);
    const state = createInitialGameState("p1", "p2", {
      id: "dandan-crystal-spray-test",
      rngSeed: "dandan-crystal-spray-seed"
    });
    setMainPhasePriority(state, "p1");
    setBlueMana(state, "p1", 1);
    state.players[0].manaPool = { ...state.players[0].manaPool, colorless: 2 };

    putOnBattlefield(
      state,
      makeCard("obj-dandan", dandanCardDefinition.id, "p1", {
        kind: "battlefield",
        scope: "shared"
      })
    );
    putOnBattlefield(
      state,
      makeCard("obj-support-island", "island", "p1", { kind: "battlefield", scope: "shared" })
    );
    putInHand(
      state,
      "p1",
      makeCard("obj-crystal-spray", crystalSprayCardDefinition.id, "p1", {
        kind: "hand",
        scope: "player",
        playerId: "p1"
      })
    );
    state.zones.set(zoneKey({ kind: "library", scope: "shared" }), ["obj-draw-card"]);
    state.objectPool.set(
      "obj-draw-card",
      makeCard("obj-draw-card", "island", "p1", { kind: "library", scope: "shared" })
    );

    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-crystal-spray",
        targets: [{ kind: "object", object: { id: "obj-dandan", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseInstance = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_MODE", mode: { id: "keyword:landwalk:0" } }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const chooseTo = processCommand(
      chooseInstance.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Mountain" } } },
      new Rng(chooseInstance.nextState.rngSeed)
    );

    expect(computeGameObject("obj-dandan", chooseTo.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Mountain" },
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
  });
});
