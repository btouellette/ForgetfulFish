import { describe, expect, it } from "vitest";

import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function createLandInHand(id: string, playerId: "p1" | "p2"): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner: playerId,
    controller: playerId,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: true,
    attachments: [],
    abilities: [],
    zone: { kind: "hand", scope: "player", playerId }
  };
}

function createNonLandInHand(id: string, playerId: "p1" | "p2"): GameObject {
  return {
    ...createLandInHand(id, playerId),
    cardDefId: "not-a-land"
  };
}

function setupLandInHand(state: GameState, playerId: "p1" | "p2", cardId = "obj-land"): void {
  const card = createLandInHand(cardId, playerId);
  state.objectPool.set(card.id, card);

  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  const hand = state.zones.get(handKey);
  if (!hand) {
    throw new Error(`missing hand zone for ${playerId}`);
  }
  hand.push(card.id);

  const playerIndex = state.players[0].id === playerId ? 0 : 1;
  state.players[playerIndex].hand.push(card.id);
}

function setMainPhaseWithPriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

describe("engine/land", () => {
  it("plays land from hand to battlefield and marks land-play used", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-1", rngSeed: "seed-land-1" });
    setMainPhaseWithPriority(state, "p1");
    setupLandInHand(state, "p1", "obj-island");

    const result = processCommand(
      state,
      { type: "PLAY_LAND", cardId: "obj-island" },
      new Rng(state.rngSeed)
    );

    const battlefield =
      result.nextState.zones.get(zoneKey({ kind: "battlefield", scope: "shared" })) ?? [];
    expect(battlefield).toContain("obj-island");
    expect(result.nextState.players[0].hand).toEqual([]);
    expect(result.nextState.turnState.landPlayedThisTurn).toBe(true);
    expect(result.newEvents[0]).toMatchObject({
      type: "ZONE_CHANGE",
      objectId: "obj-island",
      oldZcc: 0,
      newZcc: 1,
      from: { kind: "hand", scope: "player", playerId: "p1" },
      to: { kind: "battlefield", scope: "shared" }
    });
  });

  it("rejects second land play in same turn", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-2", rngSeed: "seed-land-2" });
    setMainPhaseWithPriority(state, "p1");
    state.turnState.landPlayedThisTurn = true;
    setupLandInHand(state, "p1", "obj-island");

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-island" }, new Rng(state.rngSeed))
    ).toThrow("already played a land this turn");
  });

  it("rejects land play outside main phases", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-3", rngSeed: "seed-land-3" });
    state.turnState.phase = "BEGIN_COMBAT";
    state.turnState.step = "BEGIN_COMBAT";
    setupLandInHand(state, "p1", "obj-island");

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-island" }, new Rng(state.rngSeed))
    ).toThrow("can only play a land during a main phase");
  });

  it("rejects land play when card is not in player with priority hand", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-4", rngSeed: "seed-land-4" });
    setMainPhaseWithPriority(state, "p2");
    setupLandInHand(state, "p1", "obj-island");

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-island" }, new Rng(state.rngSeed))
    ).toThrow("card must be in the hand of the player with priority");
  });

  it("rejects land play when player with priority is not active player", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-4b", rngSeed: "seed-land-4b" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState = createInitialPriorityState("p2");
    state.players[0].priority = false;
    state.players[1].priority = true;
    setupLandInHand(state, "p2", "obj-island");

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-island" }, new Rng(state.rngSeed))
    ).toThrow("can only play a land during your own turn");
  });

  it("rejects non-land cards for PLAY_LAND", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-4c", rngSeed: "seed-land-4c" });
    setMainPhaseWithPriority(state, "p1");
    const card = createNonLandInHand("obj-spell", "p1");
    state.objectPool.set(card.id, card);
    state.players[0].hand.push(card.id);
    state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" }))?.push(card.id);

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-spell" }, new Rng(state.rngSeed))
    ).toThrow("card must be a land to be played as a land");
  });

  it("rejects land play when stack is not empty", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-5", rngSeed: "seed-land-5" });
    setMainPhaseWithPriority(state, "p1");
    setupLandInHand(state, "p1", "obj-island");
    state.stack.push({ id: "spell-on-stack" });

    expect(() =>
      processCommand(state, { type: "PLAY_LAND", cardId: "obj-island" }, new Rng(state.rngSeed))
    ).toThrow("cannot play a land while stack is not empty");
  });

  it("preserves state invariants after legal land play", () => {
    const state = createInitialGameState("p1", "p2", { id: "land-6", rngSeed: "seed-land-6" });
    setMainPhaseWithPriority(state, "p1");
    setupLandInHand(state, "p1", "obj-island");

    const result = processCommand(
      state,
      { type: "PLAY_LAND", cardId: "obj-island" },
      new Rng(state.rngSeed)
    );

    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });
});
