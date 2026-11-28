import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { diminishingReturnsCardDefinition } from "../../src/cards/diminishing-returns";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey, type ZoneRef } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const SHARED_LIBRARY: ZoneRef = { kind: "library", scope: "shared" };
const SHARED_GRAVEYARD: ZoneRef = { kind: "graveyard", scope: "shared" };
const SHARED_EXILE: ZoneRef = { kind: "exile", scope: "shared" };

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

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function addToSharedZone(state: GameState, zone: ZoneRef, object: GameObject): void {
  const key = zoneKey(zone);
  state.objectPool.set(object.id, object);
  state.zones.set(key, [...(state.zones.get(key) ?? []), object.id]);
}

function zoneIds(state: GameState, zone: ZoneRef): string[] {
  return state.zones.get(zoneKey(zone)) ?? [];
}

function handIds(state: GameState, playerId: "p1" | "p2"): string[] {
  return zoneIds(state, { kind: "hand", scope: "player", playerId });
}

function createDiminishingReturnsState(options: { librarySize: number }): GameState {
  cardRegistry.set(diminishingReturnsCardDefinition.id, diminishingReturnsCardDefinition);
  const state = createInitialGameState("p1", "p2", {
    id: "diminishing-returns-test",
    rngSeed: "diminishing-returns-seed"
  });
  setMainPhasePriority(state, "p1");
  state.players[0].manaPool = { ...state.players[0].manaPool, blue: 4 };

  putInHand(
    state,
    "p1",
    makeCard("obj-dr", diminishingReturnsCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );
  putInHand(
    state,
    "p1",
    makeCard("obj-p1-hand", "island", "p1", { kind: "hand", scope: "player", playerId: "p1" })
  );
  putInHand(
    state,
    "p2",
    makeCard("obj-p2-hand", "island", "p2", { kind: "hand", scope: "player", playerId: "p2" })
  );
  addToSharedZone(state, SHARED_GRAVEYARD, makeCard("obj-gy-1", "island", "p1", SHARED_GRAVEYARD));
  addToSharedZone(state, SHARED_GRAVEYARD, makeCard("obj-gy-2", "island", "p2", SHARED_GRAVEYARD));

  for (let index = 0; index < options.librarySize; index += 1) {
    addToSharedZone(
      state,
      SHARED_LIBRARY,
      makeCard(`obj-lib-${index}`, "island", index % 2 === 0 ? "p1" : "p2", SHARED_LIBRARY)
    );
  }

  return state;
}

function castAndResolve(state: GameState): ReturnType<typeof processCommand> {
  const cast = processCommand(
    state,
    { type: "CAST_SPELL", cardId: "obj-dr", targets: [] },
    new Rng(state.rngSeed)
  );
  const pass1 = processCommand(
    cast.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(cast.nextState.rngSeed)
  );
  return processCommand(
    pass1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(pass1.nextState.rngSeed)
  );
}

describe("cards/diminishing-returns", () => {
  it("loads as a four-mana blue sorcery", () => {
    expect(diminishingReturnsCardDefinition.id).toBe("diminishing-returns");
    expect(diminishingReturnsCardDefinition.manaCost).toEqual({ blue: 2, generic: 2 });
    expect(diminishingReturnsCardDefinition.typeLine).toEqual(["Sorcery"]);
  });

  it("shuffles hands and graveyards into the shared library, exiles ten, then deals seven each", () => {
    const state = createDiminishingReturnsState({ librarySize: 30 });
    const resolved = castAndResolve(state);
    const next = resolved.nextState;

    expect(resolved.pendingChoice).toBeNull();
    expect(next.stack).toHaveLength(0);

    // 30 library + 2 hand + 2 graveyard = 34 shuffled in; 10 exiled; 14 drawn.
    expect(zoneIds(next, SHARED_EXILE)).toHaveLength(10);
    expect(handIds(next, "p1")).toHaveLength(7);
    expect(handIds(next, "p2")).toHaveLength(7);
    expect(zoneIds(next, SHARED_LIBRARY)).toHaveLength(34 - 10 - 14);
    // Only the resolved spell remains in the graveyard.
    expect(zoneIds(next, SHARED_GRAVEYARD)).toEqual(["obj-dr"]);
    expect(next.players[0].hand).toEqual(handIds(next, "p1"));
    expect(next.players[1].hand).toEqual(handIds(next, "p2"));
  });

  it("shuffles before exiling so hand and graveyard cards can be exiled or drawn", () => {
    const state = createDiminishingReturnsState({ librarySize: 30 });
    const resolved = castAndResolve(state);

    const shuffleEvents = resolved.newEvents.filter((event) => event.type === "SHUFFLED");
    expect(shuffleEvents.length).toBeGreaterThan(0);
    const beforeExile = resolved.newEvents.findIndex((event) => event.type === "SHUFFLED");
    const firstDraw = resolved.newEvents.findIndex((event) => event.type === "CARD_DRAWN");
    expect(beforeExile).toBeGreaterThanOrEqual(0);
    expect(firstDraw).toBeGreaterThan(beforeExile);
  });

  it("alternates draws between players starting with the active player in shared-deck mode", () => {
    const state = createDiminishingReturnsState({ librarySize: 30 });
    const resolved = castAndResolve(state);

    const drawOrder = resolved.newEvents.flatMap((event) =>
      event.type === "CARD_DRAWN" ? [event.playerId] : []
    );
    expect(drawOrder).toHaveLength(14);
    expect(drawOrder).toEqual(
      Array.from({ length: 14 }, (_, index) => (index % 2 === 0 ? "p1" : "p2"))
    );
  });

  it("draws up to seven when the library runs out", () => {
    // 4 library + 2 hand + 2 graveyard = 8 cards; 8 exiled leaves nothing to draw.
    const state = createDiminishingReturnsState({ librarySize: 4 });
    const resolved = castAndResolve(state);
    const next = resolved.nextState;

    expect(zoneIds(next, SHARED_EXILE)).toHaveLength(8);
    expect(handIds(next, "p1")).toHaveLength(0);
    expect(handIds(next, "p2")).toHaveLength(0);
    expect(zoneIds(next, SHARED_LIBRARY)).toHaveLength(0);
  });

  it("preserves invariants after resolution", () => {
    const state = createDiminishingReturnsState({ librarySize: 30 });
    const resolved = castAndResolve(state);

    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
