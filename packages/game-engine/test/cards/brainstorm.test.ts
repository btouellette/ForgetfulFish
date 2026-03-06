import { describe, expect, it } from "vitest";

import { brainstormCardDefinition } from "../../src/cards/brainstorm";
import { cardRegistry } from "../../src/cards";
import { processCommand } from "../../src/engine/processCommand";
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
  zone: GameObject["zone"]
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
    abilities: [],
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

function addToSharedZone(
  state: GameState,
  kind: "library" | "graveyard",
  object: GameObject
): void {
  const zone = { kind, scope: "shared" } as const;
  const key = zoneKey(zone);
  state.objectPool.set(object.id, object);
  state.zones.set(key, [...(state.zones.get(key) ?? []), object.id]);
}

function passPriorityPair(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(
    pass1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(pass1.nextState.rngSeed)
  );
}

function createBrainstormState(): GameState {
  cardRegistry.set(brainstormCardDefinition.id, brainstormCardDefinition);
  const state = createInitialGameState("p1", "p2", { id: "brainstorm-test", rngSeed: "bs-seed" });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 1);

  putInHand(
    state,
    "p1",
    makeCard("obj-brainstorm", brainstormCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  putInHand(
    state,
    "p1",
    makeCard("obj-hand-extra", "island", "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  for (let index = 0; index < 6; index += 1) {
    addToSharedZone(
      state,
      "library",
      makeCard(`obj-lib-${index}`, "island", "p1", { kind: "library", scope: "shared" })
    );
  }

  return state;
}

describe("cards/brainstorm", () => {
  it("loads as a one-mana blue instant", () => {
    expect(brainstormCardDefinition.name).toBe("Brainstorm");
    expect(brainstormCardDefinition.manaCost).toEqual({ blue: 1 });
    expect(brainstormCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast with blue mana available", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );

    expect(cast.nextState.stack.some((item) => item.object.id === "obj-brainstorm")).toBe(true);
  });

  it("draws 3 then creates an exact-2 CHOOSE_CARDS pending choice", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(
      resolved.newEvents.filter((event) => event.type === "CARD_DRAWN" && event.playerId === "p1")
    ).toHaveLength(3);
    expect(resolved.pendingChoice?.type).toBe("CHOOSE_CARDS");
    expect(resolved.pendingChoice?.constraints).toMatchObject({ min: 2, max: 2 });
  });

  it("after CHOOSE_CARDS, emits ORDER_CARDS for those 2 cards", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);

    const choose = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-0", "obj-lib-1"],
          min: 2,
          max: 2
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    expect(choose.pendingChoice?.type).toBe("ORDER_CARDS");
    expect(choose.pendingChoice?.constraints).toEqual({ cards: ["obj-lib-0", "obj-lib-1"] });
  });

  it("moves ordered cards to top of shared library in chosen order", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);

    const choose = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-0", "obj-lib-1"],
          min: 2,
          max: 2
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const order = processCommand(
      choose.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "ORDER_CARDS",
          ordered: ["obj-lib-1", "obj-lib-0"]
        }
      },
      new Rng(choose.nextState.rngSeed)
    );
    const finalResolve = order;

    const library =
      finalResolve.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    expect(library[0]).toBe("obj-lib-1");
    expect(library[1]).toBe("obj-lib-0");
  });

  it("keeps the spell on stack until the ordered put-back step completes", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);

    expect(firstResolve.nextState.stack.some((item) => item.object.id === "obj-brainstorm")).toBe(
      true
    );
    expect(firstResolve.pendingChoice?.type).toBe("CHOOSE_CARDS");
  });

  it("moves Brainstorm to shared graveyard after final resolution", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const choose = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-0", "obj-lib-1"],
          min: 2,
          max: 2
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const order = processCommand(
      choose.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "ORDER_CARDS",
          ordered: ["obj-lib-0", "obj-lib-1"]
        }
      },
      new Rng(choose.nextState.rngSeed)
    );
    const finalResolve = order;

    const graveyard =
      finalResolve.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
    expect(graveyard).toContain("obj-brainstorm");
  });

  it("preserves invariants across draw, choose, order, and finish steps", () => {
    const state = createBrainstormState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-brainstorm", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolve = passPriorityPair(cast.nextState);
    const choose = processCommand(
      firstResolve.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-0", "obj-lib-1"],
          min: 2,
          max: 2
        }
      },
      new Rng(firstResolve.nextState.rngSeed)
    );
    const order = processCommand(
      choose.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "ORDER_CARDS",
          ordered: ["obj-lib-1", "obj-lib-0"]
        }
      },
      new Rng(choose.nextState.rngSeed)
    );
    const finalResolve = order;

    expect(() => assertStateInvariants(finalResolve.nextState)).not.toThrow();
  });
});
