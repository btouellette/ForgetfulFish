import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../../src/state/gameState";
import { type GameMode } from "../../src/mode/gameMode";
import { SharedDeckMode } from "../../src/mode/sharedDeck";
import { zoneKey } from "../../src/state/zones";

const splitZonesTestMode: GameMode = {
  id: "split-zones-test",
  resolveZone(_state, logicalZone, playerId) {
    if (logicalZone === "library" || logicalZone === "graveyard") {
      if (playerId === undefined) {
        throw new Error("playerId required for split test mode");
      }

      return { kind: logicalZone, scope: "player", playerId };
    }

    if (logicalZone === "hand") {
      if (playerId === undefined) {
        throw new Error("playerId required for hand zone");
      }

      return { kind: "hand", scope: "player", playerId };
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

    const zones = new Map(zoneCatalog.map((zone) => [zoneKey(zone), []]));
    return { zoneCatalog: [...zoneCatalog], zones };
  },
  simultaneousDrawOrder(drawCount, activePlayerId) {
    const order: string[] = [];
    for (let index = 0; index < drawCount; index += 1) {
      order.push(index % 2 === 0 ? activePlayerId : activePlayerId === "p1" ? "p2" : "p1");
    }
    return order;
  },
  determineOwner(playerId) {
    return playerId;
  }
};

describe("mode/sharedDeck", () => {
  it("routes both players to shared library", () => {
    const state = createInitialGameState("p1", "p2", { id: "g", rngSeed: "seed" });

    expect(SharedDeckMode.resolveZone(state, "library", "p1")).toEqual({
      kind: "library",
      scope: "shared"
    });
    expect(SharedDeckMode.resolveZone(state, "library", "p2")).toEqual({
      kind: "library",
      scope: "shared"
    });
  });

  it("routes both players to shared graveyard", () => {
    const state = createInitialGameState("p1", "p2", { id: "g", rngSeed: "seed" });

    expect(SharedDeckMode.resolveZone(state, "graveyard", "p1")).toEqual({
      kind: "graveyard",
      scope: "shared"
    });
    expect(SharedDeckMode.resolveZone(state, "graveyard", "p2")).toEqual({
      kind: "graveyard",
      scope: "shared"
    });
  });

  it("routes hand to player-scoped zone", () => {
    const state = createInitialGameState("p1", "p2", { id: "g", rngSeed: "seed" });

    expect(SharedDeckMode.resolveZone(state, "hand", "p1")).toEqual({
      kind: "hand",
      scope: "player",
      playerId: "p1"
    });
  });

  it("alternates simultaneous draw order from active player", () => {
    expect(SharedDeckMode.simultaneousDrawOrder(4, "p1")).toEqual(["p1", "p2", "p1", "p2"]);
  });

  it("determines owner from draw action player", () => {
    expect(SharedDeckMode.determineOwner("p2", "draw")).toBe("p2");
  });

  it("allows split-zone test mode injection without kernel changes", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "g",
      rngSeed: "seed",
      mode: splitZonesTestMode
    });

    expect(splitZonesTestMode.resolveZone(state, "library", "p1")).toEqual({
      kind: "library",
      scope: "player",
      playerId: "p1"
    });
    expect(splitZonesTestMode.resolveZone(state, "library", "p2")).toEqual({
      kind: "library",
      scope: "player",
      playerId: "p2"
    });
  });
});
