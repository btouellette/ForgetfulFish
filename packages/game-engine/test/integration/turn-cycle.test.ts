import { describe, expect, it } from "vitest";

import { passPriority } from "../../src/engine/kernel";
import { processCommand } from "../../src/engine/processCommand";
import { tapForMana } from "../../src/engine/kernel";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function createIsland(
  id: string,
  owner: "p1" | "p2",
  zone: GameObject["zone"],
  tapped = false
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone
  };
}

function seedSharedLibrary(state: GameState, count: number): void {
  const libraryKey = zoneKey({ kind: "library", scope: "shared" });
  const library = state.zones.get(libraryKey);
  if (library === undefined) {
    throw new Error("missing shared library zone");
  }

  for (let index = 0; index < count; index += 1) {
    const cardId = `obj-library-island-${index}`;
    const card = createIsland(cardId, "p1", { kind: "library", scope: "shared" });
    state.objectPool.set(cardId, card);
    library.push(cardId);
  }
}

function setActivePlayer(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.activePlayerId = playerId;
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function seedPlayerHand(state: GameState, playerId: "p1" | "p2", cardId: string): void {
  const handZone = { kind: "hand", scope: "player", playerId } as const;
  const handKey = zoneKey(handZone);
  const hand = state.zones.get(handKey);
  if (hand === undefined) {
    throw new Error(`missing hand zone for ${playerId}`);
  }

  const card = createIsland(cardId, playerId, handZone);
  state.objectPool.set(cardId, card);
  hand.push(cardId);

  const playerIndex = state.players[0].id === playerId ? 0 : 1;
  state.players[playerIndex].hand.push(cardId);
}

function playMainPhaseLand(
  state: GameState,
  playerId: "p1" | "p2"
): { nextState: GameState; cardId: string; eventTypes: string[] } {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;

  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  const hand = state.zones.get(handKey) ?? [];
  const cardId = hand[0];
  if (cardId === undefined) {
    throw new Error(`expected at least one card in ${playerId} hand`);
  }

  const result = processCommand(state, { type: "PLAY_LAND", cardId }, new Rng(state.rngSeed));
  expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  return {
    nextState: result.nextState,
    cardId,
    eventTypes: result.newEvents.map((event) => event.type)
  };
}

function passBothPlayers(state: GameState): { nextState: GameState; eventTypes: string[] } {
  const first = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  expect(() => assertStateInvariants(first.nextState)).not.toThrow();

  const second = processCommand(
    first.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(first.nextState.rngSeed)
  );
  expect(() => assertStateInvariants(second.nextState)).not.toThrow();

  return {
    nextState: second.nextState,
    eventTypes: [...first.newEvents, ...second.newEvents].map((event) => event.type)
  };
}

describe("integration/turn-cycle", () => {
  it("untap step untaps permanents controlled by the active player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-untap",
      rngSeed: "seed-turn-untap"
    });
    const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
    const battlefield = state.zones.get(battlefieldKey);
    if (battlefield === undefined) {
      throw new Error("missing shared battlefield zone");
    }

    const tapped = createIsland(
      "obj-tapped-island",
      "p1",
      { kind: "battlefield", scope: "shared" },
      true
    );
    state.objectPool.set(tapped.id, tapped);
    battlefield.push(tapped.id);

    const { nextState } = passBothPlayers(state);
    expect(nextState.turnState.step).toBe("UPKEEP");
    expect(nextState.objectPool.get(tapped.id)?.tapped).toBe(false);
  });

  it("draw step adds exactly one card to the active player's hand", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-draw",
      rngSeed: "seed-turn-draw"
    });
    setActivePlayer(state, "p2");
    seedSharedLibrary(state, 20);

    const first = passBothPlayers(state);
    const second = passBothPlayers(first.nextState);
    const third = passBothPlayers(second.nextState);

    expect(third.nextState.turnState.step).toBe("MAIN_1");
    expect(third.nextState.players[1].hand).toHaveLength(1);
    expect(third.eventTypes).toContain("CARD_DRAWN");
  });

  it("play land moves the card from hand to battlefield", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-play-land",
      rngSeed: "seed-turn-play-land"
    });
    setActivePlayer(state, "p2");
    seedSharedLibrary(state, 20);

    const toMain = passBothPlayers(passBothPlayers(passBothPlayers(state).nextState).nextState);
    const beforeHandCount = toMain.nextState.players[1].hand.length;
    const played = playMainPhaseLand(toMain.nextState, "p2");

    const battlefield =
      played.nextState.zones.get(zoneKey({ kind: "battlefield", scope: "shared" })) ?? [];
    expect(played.nextState.players[1].hand.length).toBe(beforeHandCount - 1);
    expect(battlefield).toContain(played.cardId);
  });

  it("passing priority transfers priority and advances on double-pass", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-priority",
      rngSeed: "seed-turn-priority"
    });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.priorityState = createInitialPriorityState("p1");
    state.players[0].priority = true;
    state.players[1].priority = false;

    const firstPass = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
    expect(firstPass.nextState.turnState.priorityState.playerWithPriority).toBe("p2");

    const secondPass = processCommand(
      firstPass.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(firstPass.nextState.rngSeed)
    );
    expect(secondPass.nextState.turnState.step).toBe("BEGIN_COMBAT");
    expect(secondPass.nextState.turnState.priorityState.playerWithPriority).toBe("p1");
  });

  it("advances through the full phase/step sequence with pass-priority pairs", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-sequence",
      rngSeed: "seed-turn-sequence"
    });

    const visited: string[] = [state.turnState.step];
    let current = state;
    for (let index = 0; index < 12; index += 1) {
      const advanced = passBothPlayers(current);
      current = advanced.nextState;
      visited.push(current.turnState.step);
    }

    expect(visited).toEqual([
      "UNTAP",
      "UPKEEP",
      "DRAW",
      "MAIN_1",
      "BEGIN_COMBAT",
      "DECLARE_ATTACKERS",
      "DECLARE_BLOCKERS",
      "COMBAT_DAMAGE",
      "END_COMBAT",
      "MAIN_2",
      "END",
      "CLEANUP",
      "UNTAP"
    ]);
  });

  it("maintains state invariants after every command and step transition", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "turn-invariants",
      rngSeed: "seed-turn-invariants"
    });
    setActivePlayer(state, "p2");
    seedSharedLibrary(state, 20);

    let current = state;
    for (let index = 0; index < 16; index += 1) {
      const next = passBothPlayers(current);
      current = next.nextState;
      expect(() => assertStateInvariants(current)).not.toThrow();
    }
  });

  it("captures a deterministic event log for two turns with Island draw/play", () => {
    const initial = createInitialGameState("p1", "p2", {
      id: "turn-events",
      rngSeed: "seed-turn-events"
    });
    setActivePlayer(initial, "p2");
    seedSharedLibrary(initial, 20);
    seedPlayerHand(initial, "p2", "obj-p2-seed-hand");

    const eventTypes: string[] = [];
    let state = initial;

    for (let index = 0; index < 3; index += 1) {
      const advanced = passBothPlayers(state);
      state = advanced.nextState;
      eventTypes.push(...advanced.eventTypes);
    }

    const p2Land = playMainPhaseLand(state, "p2");
    state = p2Land.nextState;
    eventTypes.push(...p2Land.eventTypes);
    const p2Tap = tapForMana(state, p2Land.cardId);
    state = p2Tap.state;
    expect(state.players[1].manaPool.blue).toBe(1);
    expect(() => assertStateInvariants(state)).not.toThrow();

    while (!(state.turnState.activePlayerId === "p1" && state.turnState.step === "MAIN_1")) {
      const advanced = passBothPlayers(state);
      state = advanced.nextState;
      eventTypes.push(...advanced.eventTypes);
    }

    const p1Land = playMainPhaseLand(state, "p1");
    state = p1Land.nextState;
    eventTypes.push(...p1Land.eventTypes);
    const p1Tap = tapForMana(state, p1Land.cardId);
    state = p1Tap.state;
    expect(state.players[0].manaPool.blue).toBe(1);

    expect(eventTypes.filter((type) => type === "CARD_DRAWN").length).toBeGreaterThanOrEqual(2);
    expect(eventTypes.filter((type) => type === "ZONE_CHANGE").length).toBeGreaterThanOrEqual(2);
    expect(eventTypes).toContain("PHASE_CHANGED");

    const prioritySnapshot = passPriority(state, state.turnState.priorityState.playerWithPriority);
    expect(prioritySnapshot).not.toBe("both_passed");
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
