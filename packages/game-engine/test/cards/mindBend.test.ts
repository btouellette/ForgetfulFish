import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { mindBendCardDefinition } from "../../src/cards/mind-bend";
import { processCommand } from "../../src/engine/processCommand";
import { computeGameObject, LAYERS } from "../../src/effects/continuous/layers";
import { Rng } from "../../src/rng/rng";
import type { AbilityAst } from "../../src/cards/abilityAst";
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

function createMindBendState(): GameState {
  cardRegistry.set(mindBendCardDefinition.id, mindBendCardDefinition);
  const state = createInitialGameState("p1", "p2", {
    id: "mind-bend-test",
    rngSeed: "mind-bend-seed"
  });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 1);

  putInHand(
    state,
    "p1",
    makeCard("obj-mind-bend", mindBendCardDefinition.id, "p1", {
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

  putOnBattlefield(
    state,
    makeCard("obj-other", "memory-lapse", "p1", { kind: "battlefield", scope: "shared" }, [
      { kind: "keyword", keyword: "landwalk", landType: "Island" }
    ])
  );

  return state;
}

describe("cards/mind-bend", () => {
  it("loads as a one-mana blue instant", () => {
    expect(mindBendCardDefinition.id).toBe("mind-bend");
    expect(mindBendCardDefinition.manaCost).toEqual({ blue: 1 });
    expect(mindBendCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast targeting a battlefield permanent", () => {
    const state = createMindBendState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );

    const top = cast.nextState.stack[cast.nextState.stack.length - 1];
    expect(top?.object.id).toBe("obj-mind-bend");
    expect(top?.targets[0]).toEqual({ kind: "object", object: { id: "obj-target", zcc: 0 } });
  });

  it("prompts for which land type word to change on resolution", () => {
    const state = createMindBendState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (resolved.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected CHOOSE_MODE pending choice");
    }
    expect(resolved.pendingChoice.forPlayer).toBe("p1");
    expect(resolved.pendingChoice.constraints.modes).toEqual([{ id: "Island", label: "Island" }]);
  });

  it("prompts for the replacement land type after choosing the source word", () => {
    const state = createMindBendState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const chooseFrom = processCommand(
      firstResolve.nextState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "Island" } } },
      new Rng(firstResolve.nextState.rngSeed)
    );

    expect(chooseFrom.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (chooseFrom.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected CHOOSE_MODE replacement choice");
    }
    expect(chooseFrom.pendingChoice.constraints.modes).toEqual([
      { id: "Plains", label: "Plains" },
      { id: "Swamp", label: "Swamp" },
      { id: "Mountain", label: "Mountain" },
      { id: "Forest", label: "Forest" }
    ]);
  });

  it("adds a permanent Layer 3 text change effect and rewrites the targeted permanent", () => {
    const state = createMindBendState();
    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
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

    expect(
      chooseTo.nextState.continuousEffects.some(
        (effect) =>
          effect.layer === LAYERS.TEXT &&
          effect.duration === "permanent" &&
          effect.appliesTo.kind === "object" &&
          effect.appliesTo.object.id === "obj-target" &&
          effect.effect.kind === "text_change" &&
          effect.effect.payload?.fromLandType === "Island" &&
          effect.effect.payload?.toLandType === "Swamp"
      )
    ).toBe(true);

    expect(computeGameObject("obj-target", chooseTo.nextState).abilities).toEqual([
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
    expect(computeGameObject("obj-other", chooseTo.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" }
    ]);
    expect(() => assertStateInvariants(chooseTo.nextState)).not.toThrow();
  });

  it("rewrites matching trigger-condition land types on the targeted permanent", () => {
    const state = createMindBendState();
    state.objectPool.set(
      "obj-target",
      makeCard("obj-target", "memory-lapse", "p2", { kind: "battlefield", scope: "shared" }, [
        {
          kind: "trigger",
          event: "CUSTOM_EVENT",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        }
      ])
    );

    const cast = processCommand(
      state,
      {
        type: "CAST_SPELL",
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
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

    expect(computeGameObject("obj-target", chooseTo.nextState).abilities).toEqual([
      {
        kind: "trigger",
        event: "CUSTOM_EVENT",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      }
    ]);
  });

  it("resolves as a no-op when the target has no supported land-type words", () => {
    const state = createMindBendState();
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
        cardId: "obj-mind-bend",
        targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
      },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.nextState.continuousEffects).toHaveLength(0);
    expect(computeGameObject("obj-target", resolved.nextState).abilities).toEqual([
      { kind: "keyword", keyword: "flying" }
    ]);
    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
