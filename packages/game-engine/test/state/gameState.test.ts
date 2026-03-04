import { describe, expect, it } from "vitest";

import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

describe("state/gameState", () => {
  it("constructs GameState with all top-level fields", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.id).toBeTypeOf("string");
    expect(state.version).toBe(1);
    expect(state.engineVersion).toBe("0.1.0");
    expect(state.rngSeed).toBeTypeOf("string");
    expect(state.mode.id).toBe("shared-deck");
    expect(Array.isArray(state.players)).toBe(true);
    expect(state.zones).toBeInstanceOf(Map);
    expect(state.zoneCatalog).toBeDefined();
    expect(state.objectPool).toBeInstanceOf(Map);
    expect(state.stack).toEqual([]);
    expect(state.continuousEffects).toEqual([]);
    expect(state.pendingChoice).toBeNull();
    expect(state.lkiStore).toBeInstanceOf(Map);
    expect(state.triggerQueue).toEqual([]);
  });

  it("initializes all zones as empty arrays", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([]);
    expect(state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" }))).toEqual([]);
    expect(state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))).toEqual([]);
    expect(state.zones.get(zoneKey({ kind: "exile", scope: "shared" }))).toEqual([]);
    expect(state.zones.get(zoneKey({ kind: "stack", scope: "shared" }))).toEqual([]);
    expect(
      state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "player-1" }))
    ).toEqual([]);
    expect(
      state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "player-2" }))
    ).toEqual([]);
  });

  it("initializes players with 20 life, empty mana pool, and empty hand", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.players).toEqual([
      {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        priority: false
      },
      {
        id: "player-2",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        priority: false
      }
    ]);
  });

  it("initializes turnState with active player and untap phase", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.turnState.activePlayerId).toBe("player-1");
    expect(state.turnState.phase).toBe("UNTAP");
    expect(state.turnState.step).toBe("UNTAP");
    expect(state.turnState.landPlayedThisTurn).toBe(false);
  });

  it("starts with an empty objectPool Map", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.objectPool).toBeInstanceOf(Map);
    expect(state.objectPool.size).toBe(0);
  });

  it("passes state invariants on initial state", () => {
    const state: GameState = createInitialGameState("player-1", "player-2");
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
