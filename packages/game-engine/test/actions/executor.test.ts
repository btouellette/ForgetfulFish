import { describe, expect, it } from "vitest";

import { applyActions } from "../../src/actions/executor";
import type { GameAction } from "../../src/actions/action";
import { computeGameObject, LAYERS } from "../../src/effects/continuous/layers";
import { Rng } from "../../src/rng/rng";
import { createInitialGameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";

function baseAction() {
  return {
    source: null,
    controller: "p1" as const,
    appliedReplacements: []
  };
}

describe("actions/executor", () => {
  it("applies DEAL_DAMAGE to player life totals", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-damage", rngSeed: "seed" });

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "damage-1",
          type: "DEAL_DAMAGE",
          amount: 3,
          target: { kind: "player", playerId: "p2" }
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.players[1].life).toBe(17);
    expect(state.players[1].life).toBe(20);
  });

  it("applies DRAW by moving top library card into hand", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-draw", rngSeed: "seed" });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const handZone = state.mode.resolveZone(state, "hand", "p1");
    const libraryKey = zoneKey(libraryZone);
    const handKey = zoneKey(handZone);
    state.objectPool.set("obj-lib-1", {
      id: "obj-lib-1",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: libraryZone
    });
    state.zones.set(libraryKey, ["obj-lib-1"]);

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "draw-1",
          type: "DRAW",
          playerId: "p1",
          count: 1
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.zones.get(libraryKey)).toEqual([]);
    expect(next.zones.get(handKey)).toContain("obj-lib-1");
    expect(next.players[0].hand).toContain("obj-lib-1");
  });

  it("consumes rng for SHUFFLE actions", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-shuffle", rngSeed: "seed" });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.zones.set(libraryKey, ["a", "b", "c", "d"]);

    const rng = new Rng(state.rngSeed);
    const baselineSeed = rng.getSeed();
    const actions: GameAction[] = [
      {
        ...baseAction(),
        id: "shuffle-1",
        type: "SHUFFLE",
        zone: libraryZone
      }
    ];

    applyActions(state, actions, rng);

    expect(rng.getSeed()).not.toBe(baselineSeed);
  });

  it("emits CARD_DRAWN event payloads when DRAW resolves", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-draw-emit", rngSeed: "seed" });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.objectPool.set("obj-lib-1", {
      id: "obj-lib-1",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: libraryZone
    });
    state.zones.set(libraryKey, ["obj-lib-1"]);

    const emitted: Array<{ type: string; cardId?: string; playerId?: string }> = [];
    applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "draw-emit",
          type: "DRAW",
          playerId: "p1",
          count: 1
        }
      ],
      new Rng(state.rngSeed),
      (payload) => emitted.push(payload)
    );

    expect(emitted).toEqual([{ type: "CARD_DRAWN", playerId: "p1", cardId: "obj-lib-1" }]);
  });

  it("emits SPELL_COUNTERED for COUNTER actions", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-counter-emit", rngSeed: "seed" });
    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    state.objectPool.set("obj-spell", {
      id: "obj-spell",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: stackZone
    });
    state.zones.set(stackKey, ["obj-spell"]);
    state.stack = [
      {
        id: "stack-item",
        object: { id: "obj-spell", zcc: 0 },
        controller: "p1",
        targets: [],
        effectContext: {
          stackItemId: "stack-item",
          source: { id: "obj-spell", zcc: 0 },
          controller: "p1",
          targets: [],
          cursor: { kind: "start" },
          whiteboard: { actions: [], scratch: {} }
        }
      }
    ];

    const emitted: Array<{ type: string; object?: { id: string; zcc: number } }> = [];
    applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "counter-emit",
          type: "COUNTER",
          object: { id: "obj-spell", zcc: 0 }
        }
      ],
      new Rng(state.rngSeed),
      (payload) => emitted.push(payload)
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe("SPELL_COUNTERED");
  });

  it("emits SHUFFLED with final order when topObjectId is provided", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-shuffle-emit", rngSeed: "seed" });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.zones.set(libraryKey, ["a", "b", "c", "d"]);

    const emitted: Array<{ type: string; resultOrder?: string[] }> = [];
    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "shuffle-emit",
          type: "SHUFFLE",
          zone: libraryZone,
          topObjectId: "c"
        }
      ],
      new Rng(state.rngSeed),
      (payload) => emitted.push(payload)
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe("SHUFFLED");
    expect(emitted[0]?.resultOrder?.[0]).toBe("c");
    const finalZone = next.zones.get(libraryKey) ?? [];
    expect(emitted[0]?.resultOrder).toEqual(finalZone);
  });

  it("does not duplicate cards when MOVE_ZONE keeps object in same zone", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "exec-move-same-zone",
      rngSeed: "seed"
    });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.objectPool.set("obj-a", {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: libraryZone
    });
    state.zones.set(libraryKey, ["obj-a"]);

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "move-1",
          type: "MOVE_ZONE",
          objectId: "obj-a",
          from: libraryZone,
          to: libraryZone,
          toIndex: 0
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.zones.get(libraryKey)).toEqual(["obj-a"]);
    const moved = next.objectPool.get("obj-a");
    expect(moved?.zcc).toBe(0);
  });

  it("ignores MOVE_ZONE when object is no longer in expected from-zone", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "exec-move-from-check",
      rngSeed: "seed"
    });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const handZone = state.mode.resolveZone(state, "hand", "p1");
    const libraryKey = zoneKey(libraryZone);
    const handKey = zoneKey(handZone);
    state.objectPool.set("obj-a", {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: handZone
    });
    state.zones.set(libraryKey, []);
    state.zones.set(handKey, ["obj-a"]);
    state.players[0].hand = ["obj-a"];

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "move-1",
          type: "MOVE_ZONE",
          objectId: "obj-a",
          from: libraryZone,
          to: state.mode.resolveZone(state, "graveyard", "p1")
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.zones.get(handKey)).toEqual(["obj-a"]);
  });

  it("captures LKI when MOVE_ZONE changes zones", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-move-lki", rngSeed: "seed" });
    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const graveyardZone = state.mode.resolveZone(state, "graveyard", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.objectPool.set("obj-a", {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: libraryZone
    });
    state.zones.set(libraryKey, ["obj-a"]);

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "move-1",
          type: "MOVE_ZONE",
          objectId: "obj-a",
          from: libraryZone,
          to: graveyardZone
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.lkiStore.size).toBeGreaterThan(0);
  });

  it("removes stack item and stack-zone object when COUNTER resolves", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-counter", rngSeed: "seed" });
    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    state.objectPool.set("obj-spell", {
      id: "obj-spell",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: stackZone
    });
    state.zones.set(stackKey, ["obj-spell"]);
    state.stack = [
      {
        id: "stack-item",
        object: { id: "obj-spell", zcc: 0 },
        controller: "p1",
        targets: [],
        effectContext: {
          stackItemId: "stack-item",
          source: { id: "obj-spell", zcc: 0 },
          controller: "p1",
          targets: [],
          cursor: { kind: "start" },
          whiteboard: { actions: [], scratch: {} }
        }
      }
    ];

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "counter-1",
          type: "COUNTER",
          object: { id: "obj-spell", zcc: 0 }
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.stack).toHaveLength(0);
    expect(next.zones.get(stackKey)).toEqual([]);
  });

  it("creates a control-changing continuous effect for SET_CONTROL", () => {
    const state = createInitialGameState("p1", "p2", { id: "exec-set-control", rngSeed: "seed" });
    state.objectPool.set("obj-creature", {
      id: "obj-creature",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "control-1",
          source: { id: "spell-1", zcc: 0 },
          type: "SET_CONTROL",
          objectId: "obj-creature",
          to: "p2",
          duration: "until_end_of_turn"
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.objectPool.get("obj-creature")?.controller).toBe("p1");
    expect(next.continuousEffects).toHaveLength(1);
    expect(next.continuousEffects[0]).toMatchObject({
      id: "control-1",
      source: { id: "spell-1", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: state.version,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-creature" },
      effect: {
        kind: "set_controller",
        payload: { playerId: "p2" }
      }
    });
    expect(computeGameObject("obj-creature", next).controller).toBe("p2");
  });
});
