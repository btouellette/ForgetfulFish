import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { mysticalTutorCardDefinition } from "../../src/cards/mystical-tutor";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const testSorceryDefinition: CardDefinition = {
  id: "test-p2-10-sorcery",
  name: "Test Sorcery",
  manaCost: { blue: 1 },
  typeLine: ["Sorcery"],
  subtypes: [],
  color: ["blue"],
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

function createMysticalTutorState(options?: { includeLibraryCards?: boolean }): GameState {
  cardRegistry.set(mysticalTutorCardDefinition.id, mysticalTutorCardDefinition);
  cardRegistry.set(testSorceryDefinition.id, testSorceryDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "mystical-tutor-test",
    rngSeed: "mt-seed"
  });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 1);

  putInHand(
    state,
    "p1",
    makeCard("obj-mystical-tutor", mysticalTutorCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  if (options?.includeLibraryCards === false) {
    return state;
  }

  addToSharedLibrary(
    state,
    makeCard("obj-lib-land", "island", "p1", { kind: "library", scope: "shared" })
  );
  addToSharedLibrary(
    state,
    makeCard("obj-lib-instant", "memory-lapse", "p1", { kind: "library", scope: "shared" })
  );
  addToSharedLibrary(
    state,
    makeCard("obj-lib-sorcery", testSorceryDefinition.id, "p2", {
      kind: "library",
      scope: "shared"
    })
  );

  return state;
}

describe("cards/mystical-tutor", () => {
  it("loads with correct id and instant type", () => {
    expect(mysticalTutorCardDefinition.id).toBe("mystical-tutor");
    expect(mysticalTutorCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast with blue mana available", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );

    expect(cast.nextState.stack.some((item) => item.object.id === "obj-mystical-tutor")).toBe(true);
  });

  it("offers CHOOSE_CARDS with instant/sorcery candidates from shared library", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice?.type).toBe("CHOOSE_CARDS");
    expect(resolved.pendingChoice?.constraints).toMatchObject({
      candidates: ["obj-lib-instant", "obj-lib-sorcery"],
      min: 0,
      max: 1
    });
  });

  it("shuffles library then places selected card on top", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    const choose = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-sorcery"],
          min: 0,
          max: 1
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    const library = choose.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    expect(choose.newEvents.some((event) => event.type === "SHUFFLED")).toBe(true);
    expect(library[0]).toBe("obj-lib-sorcery");
  });

  it("searches full shared library (including opponent-owned cards)", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    expect(resolved.pendingChoice?.constraints).toMatchObject({
      candidates: ["obj-lib-instant", "obj-lib-sorcery"]
    });
  });

  it("supports choosing zero cards and still shuffles", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);

    const choose = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: [],
          min: 0,
          max: 1
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(choose.newEvents.some((event) => event.type === "SHUFFLED")).toBe(true);
    const graveyard =
      choose.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
    expect(graveyard).toContain("obj-mystical-tutor");
  });

  it("resolves safely with empty library and no pending choice", () => {
    const state = createMysticalTutorState({ includeLibraryCards: false });
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );

    expect(() => passPriorityPair(cast.nextState)).not.toThrow();
    const resolved = passPriorityPair(cast.nextState);
    expect(resolved.pendingChoice).toBeNull();
  });

  it("preserves invariants after shuffle and placement", () => {
    const state = createMysticalTutorState();
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mystical-tutor", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = passPriorityPair(cast.nextState);
    const choose = processCommand(
      resolved.nextState,
      {
        type: "MAKE_CHOICE",
        payload: {
          type: "CHOOSE_CARDS",
          selected: ["obj-lib-instant"],
          min: 0,
          max: 1
        }
      },
      new Rng(resolved.nextState.rngSeed)
    );

    expect(() => assertStateInvariants(choose.nextState)).not.toThrow();
  });
});
