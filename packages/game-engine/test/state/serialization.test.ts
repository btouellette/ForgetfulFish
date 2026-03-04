import { describe, expect, it } from "vitest";

import {
  captureSnapshot,
  createInitialGameState,
  deserializeGameState,
  deserializeGameStateFromPersistence,
  serializeGameState,
  serializeGameStateForPersistence,
  zoneKey,
  type GameMode,
  type GameObject,
  type PlayerId,
  type SerializedGameState
} from "../../src/index";

const splitZonesMode: GameMode = {
  id: "split-zones-test",
  resolveZone(_state, logicalZone, playerId) {
    if (
      (logicalZone === "library" || logicalZone === "graveyard" || logicalZone === "hand") &&
      playerId
    ) {
      return { kind: logicalZone, scope: "player", playerId };
    }

    return { kind: logicalZone, scope: "shared" };
  },
  createInitialZones(players) {
    const zoneCatalog = [
      { kind: "library", scope: "player", playerId: players[0] },
      { kind: "library", scope: "player", playerId: players[1] },
      { kind: "graveyard", scope: "player", playerId: players[0] },
      { kind: "graveyard", scope: "player", playerId: players[1] },
      { kind: "battlefield", scope: "shared" },
      { kind: "exile", scope: "shared" },
      { kind: "stack", scope: "shared" },
      { kind: "hand", scope: "player", playerId: players[0] },
      { kind: "hand", scope: "player", playerId: players[1] }
    ] as const;

    return {
      zoneCatalog: [...zoneCatalog],
      zones: new Map(zoneCatalog.map((zone) => [zoneKey(zone), []]))
    };
  },
  simultaneousDrawOrder(drawCount, activePlayerId, players) {
    const otherPlayerId = players[0] === activePlayerId ? players[1] : players[0];
    const order: PlayerId[] = [];

    for (let index = 0; index < drawCount; index += 1) {
      order.push(index % 2 === 0 ? activePlayerId : otherPlayerId);
    }

    return order;
  },
  determineOwner(playerId) {
    return playerId;
  }
};

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

  it("serializes __proto__ keys without mutating object prototypes", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-proto",
      rngSeed: "seed-proto"
    });
    const object: GameObject = {
      id: "__proto__",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map([["charge", 7]]),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "library", scope: "shared" }
    };

    state.objectPool.set(object.id, object);

    const serialized = serializeGameState(state);
    const objectPool = serialized.objectPool;

    expect(objectPool["__proto__"]?.cardDefId).toBe("island");
    expect(Object.getPrototypeOf(objectPool)).toBeNull();
    expect(Object.getPrototypeOf(serialized.lkiStore)).toBeNull();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
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

  it("round-trips a custom mode when a mode registry is provided", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-1",
      rngSeed: "seed-1",
      mode: splitZonesMode
    });
    const payload = serializeGameState(state);
    const restored = deserializeGameState(payload, { [splitZonesMode.id]: splitZonesMode });

    expect(restored.mode.id).toBe(splitZonesMode.id);
    expect(serializeGameState(restored)).toEqual(payload);
  });
});
