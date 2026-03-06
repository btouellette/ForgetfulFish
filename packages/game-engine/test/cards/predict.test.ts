import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { predictCardDefinition } from "../../src/cards/predict";
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

function createPredictState(): GameState {
  cardRegistry.set(predictCardDefinition.id, predictCardDefinition);
  const state = createInitialGameState("p1", "p2", { id: "predict-test", rngSeed: "predict-seed" });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 2);

  putInHand(
    state,
    "p1",
    makeCard("obj-predict", predictCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  addToSharedLibrary(
    state,
    makeCard("obj-lib-memory-lapse", "memory-lapse", "p1", { kind: "library", scope: "shared" })
  );
  addToSharedLibrary(
    state,
    makeCard("obj-lib-island", "island", "p2", { kind: "library", scope: "shared" })
  );
  addToSharedLibrary(
    state,
    makeCard("obj-lib-third", "island", "p1", { kind: "library", scope: "shared" })
  );
  addToSharedLibrary(
    state,
    makeCard("obj-lib-fourth", "island", "p2", { kind: "library", scope: "shared" })
  );

  return state;
}

function castAndResolveToNameChoice(state: GameState): ReturnType<typeof processCommand> {
  const cast = processCommand(
    state,
    { type: "CAST_SPELL", cardId: "obj-predict", targets: [] },
    new Rng(state.rngSeed)
  );
  return passPriorityPair(cast.nextState);
}

describe("cards/predict", () => {
  it("loads as a two-mana blue instant", () => {
    expect(predictCardDefinition.id).toBe("predict");
    expect(predictCardDefinition.manaCost).toEqual({ blue: 1, generic: 1 });
    expect(predictCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("prompts the caster with NAME_CARD during resolution", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    expect(resolved.pendingChoice?.type).toBe("NAME_CARD");
    expect(resolved.pendingChoice?.forPlayer).toBe("p1");
  });

  it("mills top 2 cards from shared library to shared graveyard after naming", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Island"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    const graveyard =
      named.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
    expect(graveyard).toEqual(expect.arrayContaining(["obj-lib-memory-lapse", "obj-lib-island"]));
  });

  it("draws 2 cards when the named card was milled", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Memory Lapse"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(
      named.newEvents.filter((event) => event.type === "CARD_DRAWN" && event.playerId === "p1")
    ).toHaveLength(2);
  });

  it("does not draw cards when the named card was not milled", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Mystical Tutor"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(named.newEvents.some((event) => event.type === "CARD_DRAWN")).toBe(false);
  });

  it("uses shared deck routing for both milling and conditional draws", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Memory Lapse"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    const library = named.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    const hand =
      named.nextState.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" })) ?? [];

    expect(library).toEqual([]);
    expect(hand).toEqual(expect.arrayContaining(["obj-lib-third", "obj-lib-fourth"]));
  });

  it("emits CHOICE_MADE with the provided named card", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Memory Lapse"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(named.newEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CHOICE_MADE",
          selection: { type: "NAME_CARD", cardName: "Memory Lapse" }
        })
      ])
    );
  });

  it("preserves invariants after name, mill, and conditional draw", () => {
    const state = createPredictState();
    const resolved = castAndResolveToNameChoice(state);

    const named = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "NAME_CARD",
          cardName: "Memory Lapse"
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(() => assertStateInvariants(named.nextState)).not.toThrow();
  });
});
