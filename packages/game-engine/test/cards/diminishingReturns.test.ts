import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { diminishingReturnsCardDefinition } from "../../src/cards/diminishing-returns";
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

function sharedZone(state: GameState, kind: "library" | "graveyard" | "exile"): string[] {
  return state.zones.get(zoneKey({ kind, scope: "shared" })) ?? [];
}

function handZone(state: GameState, playerId: "p1" | "p2"): string[] {
  return state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId })) ?? [];
}

function resolveTopSpellByPassing(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(pass1.nextState, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
}

function createDiminishingReturnsState(options?: {
  p1HandCount?: number;
  p2HandCount?: number;
  graveyardCount?: number;
  libraryCount?: number;
}) {
  cardRegistry.set(diminishingReturnsCardDefinition.id, diminishingReturnsCardDefinition);

  const state = createInitialGameState("p1", "p2", { id: "dr-test", rngSeed: "dr-seed" });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 4);

  const spell = makeCard("obj-dr-cast", diminishingReturnsCardDefinition.id, "p1", {
    kind: "hand",
    scope: "player",
    playerId: "p1"
  });
  putInHand(state, "p1", spell);

  for (let index = 0; index < (options?.p1HandCount ?? 2); index += 1) {
    putInHand(
      state,
      "p1",
      makeCard(`obj-p1-hand-${index}`, "island", "p1", {
        kind: "hand",
        scope: "player",
        playerId: "p1"
      })
    );
  }

  for (let index = 0; index < (options?.p2HandCount ?? 3); index += 1) {
    putInHand(
      state,
      "p2",
      makeCard(`obj-p2-hand-${index}`, "island", "p2", {
        kind: "hand",
        scope: "player",
        playerId: "p2"
      })
    );
  }

  for (let index = 0; index < (options?.graveyardCount ?? 4); index += 1) {
    addToSharedZone(
      state,
      "graveyard",
      makeCard(`obj-gy-${index}`, "island", index % 2 === 0 ? "p1" : "p2", {
        kind: "graveyard",
        scope: "shared"
      })
    );
  }

  for (let index = 0; index < (options?.libraryCount ?? 40); index += 1) {
    addToSharedZone(
      state,
      "library",
      makeCard(`obj-lib-${index}`, "island", "p1", { kind: "library", scope: "shared" })
    );
  }

  return state;
}

function castAndResolve(state: GameState): ReturnType<typeof processCommand> {
  const cast = processCommand(
    state,
    { type: "CAST_SPELL", cardId: "obj-dr-cast", targets: [] },
    new Rng(state.rngSeed)
  );

  return resolveTopSpellByPassing(cast.nextState);
}

describe("cards/diminishing-returns", () => {
  it("loads as a 4-mana blue sorcery", () => {
    expect(diminishingReturnsCardDefinition.name).toBe("Diminishing Returns");
    expect(diminishingReturnsCardDefinition.manaCost).toEqual({ blue: 2, generic: 2 });
    expect(diminishingReturnsCardDefinition.typeLine).toEqual(["Sorcery"]);
  });

  it("moves both players' hands into the shared library before drawing", () => {
    const state = createDiminishingReturnsState({ p1HandCount: 2, p2HandCount: 3 });
    const resolved = castAndResolve(state);

    const recycled = [
      ...sharedZone(resolved.nextState, "library"),
      ...sharedZone(resolved.nextState, "exile"),
      ...handZone(resolved.nextState, "p1"),
      ...handZone(resolved.nextState, "p2")
    ];

    expect(recycled).toEqual(
      expect.arrayContaining([
        "obj-p1-hand-0",
        "obj-p1-hand-1",
        "obj-p2-hand-0",
        "obj-p2-hand-1",
        "obj-p2-hand-2"
      ])
    );
  });

  it("leaves both hands empty before the draws when the library runs out", () => {
    const state = createDiminishingReturnsState({
      libraryCount: 0,
      p1HandCount: 2,
      p2HandCount: 3,
      graveyardCount: 4
    });
    const resolved = castAndResolve(state);

    // 5 hand cards + 4 graveyard cards is fewer than the ten exiled, so nothing is left to draw.
    expect(sharedZone(resolved.nextState, "exile").length).toBe(9);
    expect(handZone(resolved.nextState, "p1")).toEqual([]);
    expect(handZone(resolved.nextState, "p2")).toEqual([]);
  });

  it("moves the shared graveyard into the shared library", () => {
    const state = createDiminishingReturnsState({ graveyardCount: 4 });
    const resolved = castAndResolve(state);

    // Only the spell itself is in the graveyard after it resolves.
    expect(sharedZone(resolved.nextState, "graveyard")).toEqual(["obj-dr-cast"]);
  });

  it("shuffles the shared library while resolving", () => {
    const state = createDiminishingReturnsState();
    const resolved = castAndResolve(state);

    expect(
      resolved.newEvents.some((event) => event.type === "SHUFFLED" && event.zone.kind === "library")
    ).toBe(true);
  });

  it("exiles exactly ten cards from the top of the shared library", () => {
    const state = createDiminishingReturnsState();
    const resolved = castAndResolve(state);

    expect(sharedZone(resolved.nextState, "exile").length).toBe(10);
  });

  it("draws each player up to seven cards", () => {
    const state = createDiminishingReturnsState({ p1HandCount: 2, p2HandCount: 3 });
    const resolved = castAndResolve(state);

    expect(handZone(resolved.nextState, "p1").length).toBe(7);
    expect(handZone(resolved.nextState, "p2").length).toBe(7);
  });

  it("accounts for every card across the shuffle, exile, and draws", () => {
    const state = createDiminishingReturnsState({ p1HandCount: 2, p2HandCount: 3 });
    const resolved = castAndResolve(state);
    const librarySize = sharedZone(resolved.nextState, "library").length;

    // 40 library + 5 hands + 4 graveyard + 1 spell, minus 10 exiled, minus 14 drawn,
    // minus the resolved spell in the graveyard.
    expect(librarySize).toBe(40 + 5 + 4 - 10 - 14);
  });

  it("keeps state invariants after the multi-zone shuffle", () => {
    const state = createDiminishingReturnsState();
    const resolved = castAndResolve(state);

    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
