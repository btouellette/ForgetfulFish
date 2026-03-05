import { describe, expect, it } from "vitest";

import { drawCard } from "../../src/engine/kernel";
import type { GameMode } from "../../src/mode/gameMode";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState } from "../../src/state/gameState";
import { zoneKey, type ZoneRef } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function createLibraryCard(id: string, owner: "p1" | "p2" = "p1"): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "library", scope: "shared" }
  };
}

function seedSharedLibrary(
  state: ReturnType<typeof createInitialGameState>,
  cardIds: string[]
): void {
  const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" }));
  if (!library) {
    throw new Error("missing shared library zone");
  }

  for (const cardId of cardIds) {
    const card = createLibraryCard(cardId);
    state.objectPool.set(cardId, card);
    library.push(cardId);
  }
}

const splitZonesMode: GameMode = {
  id: "split-zones-test",
  resolveZone(_state, logicalZone, playerId) {
    if (playerId !== undefined && (logicalZone === "library" || logicalZone === "graveyard")) {
      return { kind: logicalZone, scope: "player", playerId };
    }
    if (logicalZone === "hand") {
      if (playerId === undefined) {
        throw new Error("playerId required for hand");
      }

      return { kind: "hand", scope: "player", playerId };
    }

    return { kind: logicalZone, scope: "shared" };
  },
  createInitialZones(players) {
    const zoneCatalog: ZoneRef[] = [
      { kind: "library", scope: "player", playerId: players[0] },
      { kind: "library", scope: "player", playerId: players[1] },
      { kind: "graveyard", scope: "player", playerId: players[0] },
      { kind: "graveyard", scope: "player", playerId: players[1] },
      { kind: "battlefield", scope: "shared" },
      { kind: "exile", scope: "shared" },
      { kind: "stack", scope: "shared" },
      { kind: "hand", scope: "player", playerId: players[0] },
      { kind: "hand", scope: "player", playerId: players[1] }
    ];

    return {
      zoneCatalog,
      zones: new Map(zoneCatalog.map((zone) => [zoneKey(zone), []]))
    };
  },
  simultaneousDrawOrder(drawCount, activePlayerId, players) {
    return Array.from({ length: drawCount }, (_, index) =>
      index % 2 === 0 ? activePlayerId : players.find((playerId) => playerId !== activePlayerId)!
    );
  },
  determineOwner(playerId) {
    return playerId;
  }
};

describe("engine/draw", () => {
  it("draws top card from shared library into player's hand", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-1", rngSeed: "seed-1" });
    seedSharedLibrary(state, ["obj-1", "obj-2", "obj-3", "obj-4", "obj-5"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(result.state.players[0].hand).toEqual(["obj-1"]);
    expect(result.state.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([
      "obj-2",
      "obj-3",
      "obj-4",
      "obj-5"
    ]);
  });

  it("emits CARD_DRAWN with player and card identity", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-2", rngSeed: "seed-2" });
    seedSharedLibrary(state, ["obj-card"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("CARD_DRAWN");
    expect(result.events[0]).toMatchObject({
      type: "CARD_DRAWN",
      playerId: "p1",
      cardId: "obj-card"
    });
  });

  it("updates drawn object's zone, owner, and increments zcc", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-3", rngSeed: "seed-3" });
    seedSharedLibrary(state, ["obj-zcc"]);

    const result = drawCard(state, "p2", new Rng(state.rngSeed));
    const object = result.state.objectPool.get("obj-zcc");

    expect(object?.zone).toEqual({ kind: "hand", scope: "player", playerId: "p2" });
    expect(object?.owner).toBe("p2");
    expect(object?.controller).toBe("p2");
    expect(object?.zcc).toBe(1);
  });

  it("increments state version when emitting draw event", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "draw-version",
      rngSeed: "seed-version"
    });
    seedSharedLibrary(state, ["obj-ver"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(result.state.version).toBe(state.version + 1);
    expect(result.events[0]?.seq).toBe(result.state.version);
    expect(result.events[0]?.id).toBe(`${state.id}:${result.state.version}`);
  });

  it("stores LKI snapshot keyed by pre-draw id:zcc", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-4", rngSeed: "seed-4" });
    seedSharedLibrary(state, ["obj-lki"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));
    const snapshot = result.state.lkiStore.get("obj-lki:0");

    expect(snapshot).toBeDefined();
    expect(snapshot?.ref).toEqual({ id: "obj-lki", zcc: 0 });
    expect(snapshot?.zone).toEqual({ kind: "library", scope: "shared" });
  });

  it("handles one-card library and leaves library empty", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-5", rngSeed: "seed-5" });
    seedSharedLibrary(state, ["obj-last"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(result.state.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([]);
  });

  it("supports multiple sequential draws in order", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-6", rngSeed: "seed-6" });
    seedSharedLibrary(state, ["obj-a", "obj-b", "obj-c"]);

    const first = drawCard(state, "p1", new Rng(state.rngSeed));
    const second = drawCard(first.state, "p1", new Rng(first.state.rngSeed));

    expect(second.state.players[0].hand).toEqual(["obj-a", "obj-b"]);
    expect(second.state.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([
      "obj-c"
    ]);
  });

  it("draws even when player's hand already has many cards", () => {
    const state = createInitialGameState("p1", "p2", { id: "draw-7", rngSeed: "seed-7" });
    const handZone = state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" }));
    if (!handZone) {
      throw new Error("missing p1 hand zone");
    }

    for (let index = 0; index < 7; index += 1) {
      const objectId = `obj-hand-${index}`;
      const inHand: GameObject = {
        ...createLibraryCard(objectId),
        zone: { kind: "hand", scope: "player", playerId: "p1" }
      };
      state.objectPool.set(objectId, inHand);
      handZone.push(objectId);
      state.players[0].hand.push(objectId);
    }

    seedSharedLibrary(state, ["obj-next"]);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(result.state.players[0].hand).toHaveLength(8);
    expect(result.state.players[0].hand[result.state.players[0].hand.length - 1]).toBe("obj-next");
  });

  it("passes invariants after draw and routes through split-zone mode without kernel changes", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "draw-8",
      rngSeed: "seed-8",
      mode: splitZonesMode
    });
    const p1LibraryKey = zoneKey({ kind: "library", scope: "player", playerId: "p1" });
    const p1Library = state.zones.get(p1LibraryKey);
    if (!p1Library) {
      throw new Error("missing p1 split library");
    }

    const card = createLibraryCard("obj-split", "p1");
    card.zone = { kind: "library", scope: "player", playerId: "p1" };
    state.objectPool.set(card.id, card);
    p1Library.push(card.id);

    const result = drawCard(state, "p1", new Rng(state.rngSeed));

    expect(
      result.state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" }))
    ).toEqual(["obj-split"]);
    expect(() => assertStateInvariants(result.state)).not.toThrow();
  });
});
