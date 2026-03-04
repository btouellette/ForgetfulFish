import { describe, expect, it } from "vitest";

import {
  captureSnapshot,
  createInitialGameState,
  deserializeGameState,
  deserializeGameStateFromPersistence,
  serializeGameState,
  serializeGameStateForPersistence,
  zoneKey,
  type GameObject,
  type SerializedGameState
} from "../../src/index";

function containsMap(value: unknown): boolean {
  if (value instanceof Map) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsMap(entry));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) => containsMap(entry));
  }

  return false;
}

describe("state/serialization", () => {
  it("serializes map-based state into JSON-safe records", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const object: GameObject = {
      id: "obj-1",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map([["charge", 2]]),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "library", scope: "shared" }
    };

    state.objectPool.set(object.id, object);
    state.lkiStore.set(
      "obj-1:0",
      captureSnapshot(object, { ...object }, { kind: "library", scope: "shared" })
    );

    const libraryKey = zoneKey({ kind: "library", scope: "shared" });
    const library = state.zones.get(libraryKey);

    if (!library) {
      throw new Error("expected shared library zone");
    }

    library.push(object.id);

    const serialized = serializeGameState(state);

    expect(serialized.zones[libraryKey]).toEqual(["obj-1"]);
    expect(serialized.objectPool["obj-1"]?.counters).toEqual({ charge: 2 });
    expect(serialized.lkiStore["obj-1:0"]?.ref).toEqual({ id: "obj-1", zcc: 0 });
    expect(serialized.lkiStore["obj-1:0"]?.base.counters).toEqual({ charge: 2 });
  });

  it("deserializes serialized state into map-based runtime structures", () => {
    const serialized: SerializedGameState = {
      id: "game-1",
      version: 2,
      engineVersion: "0.2.0",
      rngSeed: "seed-2",
      modeId: "shared-deck",
      players: [
        {
          id: "p1",
          life: 20,
          manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
          hand: ["obj-1"],
          priority: true
        },
        {
          id: "p2",
          life: 20,
          manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
          hand: [],
          priority: false
        }
      ],
      zones: {
        "shared:library": ["obj-1"],
        "shared:graveyard": [],
        "shared:battlefield": [],
        "shared:exile": [],
        "shared:stack": [],
        "player:p1:hand": [],
        "player:p2:hand": []
      },
      zoneCatalog: [
        { kind: "library", scope: "shared" },
        { kind: "graveyard", scope: "shared" },
        { kind: "battlefield", scope: "shared" },
        { kind: "exile", scope: "shared" },
        { kind: "stack", scope: "shared" },
        { kind: "hand", scope: "player", playerId: "p1" },
        { kind: "hand", scope: "player", playerId: "p2" }
      ],
      objectPool: {
        "obj-1": {
          id: "obj-1",
          zcc: 0,
          cardDefId: "island",
          owner: "p1",
          controller: "p1",
          counters: { charge: 1 },
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          abilities: [],
          zone: { kind: "library", scope: "shared" }
        }
      },
      stack: [],
      turnState: {
        activePlayerId: "p1",
        phase: "UNTAP",
        step: "UNTAP",
        priorityState: { holder: "p1", passedBy: [] },
        attackers: [],
        blockers: [],
        landPlayedThisTurn: false
      },
      continuousEffects: [],
      pendingChoice: null,
      lkiStore: {
        "obj-1:0": {
          ref: { id: "obj-1", zcc: 0 },
          zone: { kind: "library", scope: "shared" },
          base: {
            id: "obj-1",
            zcc: 0,
            cardDefId: "island",
            owner: "p1",
            controller: "p1",
            counters: { charge: 1 },
            damage: 0,
            tapped: false,
            summoningSick: false,
            attachments: [],
            abilities: [],
            zone: { kind: "library", scope: "shared" }
          },
          derived: {
            id: "obj-1",
            zcc: 0,
            cardDefId: "island",
            owner: "p1",
            controller: "p1",
            counters: { charge: 1 },
            damage: 0,
            tapped: false,
            summoningSick: false,
            attachments: [],
            abilities: [],
            zone: { kind: "library", scope: "shared" }
          }
        }
      },
      triggerQueue: []
    };

    const state = deserializeGameState(serialized);

    expect(state.zones).toBeInstanceOf(Map);
    expect(state.objectPool).toBeInstanceOf(Map);
    expect(state.lkiStore).toBeInstanceOf(Map);
    expect(state.objectPool.get("obj-1")?.counters).toBeInstanceOf(Map);
    expect(state.objectPool.get("obj-1")?.counters.get("charge")).toBe(1);
  });

  it("preserves state through serialize/deserialize round trip", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const serialized = serializeGameState(state);
    const rehydrated = deserializeGameState(serialized);
    const reserialized = serializeGameState(rehydrated);

    expect(reserialized).toEqual(serialized);
  });

  it("produces persistence payloads with no Map instances", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const payload = serializeGameStateForPersistence(state);

    expect(containsMap(payload)).toBe(false);
  });

  it("supports persistence helper round trip", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const payload = serializeGameStateForPersistence(state);
    const restored = deserializeGameStateFromPersistence(payload);

    expect(serializeGameState(restored)).toEqual(payload);
  });
});
