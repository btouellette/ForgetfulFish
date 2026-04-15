import { describe, expect, it } from "vitest";

import { addContinuousEffect, LAYERS } from "../../src/effects/continuous/layers";
import {
  advanceStep,
  advanceStepWithEvents,
  advanceTurn,
  handlePassPriority
} from "../../src/engine/kernel";
import { Rng } from "../../src/rng/rng";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import type { GameObject } from "../../src/state/gameObject";

function createIsland(id: string, controller: "p1" | "p2", tapped = false): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner: controller,
    controller,
    counters: new Map(),
    damage: 0,
    tapped,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "library", scope: "shared" }
  };
}

function withStep(state: GameState, step: GameState["turnState"]["step"]): GameState {
  return {
    ...state,
    turnState: {
      ...state.turnState,
      phase: step,
      step
    }
  };
}

describe("engine/kernel", () => {
  it("walks a full turn cycle in order when steps are advanced", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "kernel-order",
      rngSeed: "seed-kernel-order"
    });

    const visited: string[] = [state.turnState.step];
    let current = state;
    for (let index = 0; index < 12; index += 1) {
      current = advanceStep(current);
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

  it("untaps permanents controlled by the active player during untap step", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "kernel-untap",
      rngSeed: "seed-kernel-untap"
    });
    const permanent: GameObject = {
      ...createIsland("obj-tapped", "p1", true),
      zone: { kind: "battlefield", scope: "shared" }
    };
    state.objectPool.set(permanent.id, permanent);
    state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(permanent.id);

    const next = advanceStep(state);
    const nextPermanent = next.objectPool.get(permanent.id);

    expect(next.turnState.step).toBe("UPKEEP");
    expect(nextPermanent?.tapped).toBe(false);
  });

  it("untaps permanents whose control changes continuously to the active player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "kernel-derived-untap",
      rngSeed: "seed-kernel-derived-untap"
    });
    const permanent: GameObject = {
      ...createIsland("obj-stolen-untap", "p2", true),
      zone: { kind: "battlefield", scope: "shared" }
    };
    state.objectPool.set(permanent.id, permanent);
    state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(permanent.id);

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-stolen-untap",
      source: { id: "source-untap", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: permanent.id, zcc: permanent.zcc } },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    const next = advanceStep(withControlEffect);
    const nextPermanent = next.objectPool.get(permanent.id);

    expect(next.turnState.step).toBe("UPKEEP");
    expect(nextPermanent?.tapped).toBe(false);
  });

  it("draw step draws one card for active player", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-draw",
      rngSeed: "seed-kernel-draw"
    });
    const state = withStep(
      {
        ...base,
        turnState: {
          ...base.turnState,
          activePlayerId: "p2",
          priorityState: createInitialPriorityState("p2")
        },
        players: [
          { ...base.players[0], priority: false },
          { ...base.players[1], priority: true }
        ]
      },
      "DRAW"
    );
    const card = createIsland("obj-draw-1", "p2");
    state.objectPool.set(card.id, card);
    state.zones.get(zoneKey({ kind: "library", scope: "shared" }))?.push(card.id);

    const next = advanceStep(state);

    expect(next.turnState.step).toBe("MAIN_1");
    expect(next.players[1].hand).toEqual([card.id]);
    expect(next.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([]);
    expect(next.zones.get(zoneKey({ kind: "hand", scope: "player", playerId: "p2" }))).toEqual([
      card.id
    ]);
  });

  it("advanceTurn swaps active player and resets land-play state", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-turn",
      rngSeed: "seed-kernel-turn"
    });
    const state: GameState = {
      ...base,
      turnState: {
        ...base.turnState,
        activePlayerId: "p1",
        phase: "MAIN_2",
        step: "MAIN_2",
        landPlayedThisTurn: true
      }
    };

    const next = advanceTurn(state);

    expect(next.turnState.activePlayerId).toBe("p2");
    expect(next.turnState.phase).toBe("UNTAP");
    expect(next.turnState.step).toBe("UNTAP");
    expect(next.turnState.landPlayedThisTurn).toBe(false);
    expect(next.turnState.priorityState.playerWithPriority).toBe("p2");
  });

  it("skips first-turn draw for the starting player", () => {
    const state = withStep(
      createInitialGameState("p1", "p2", {
        id: "kernel-first-draw-skip",
        rngSeed: "seed-kernel-first-draw-skip"
      }),
      "DRAW"
    );
    const card = createIsland("obj-first-skip", "p1");
    state.objectPool.set(card.id, card);
    state.zones.get(zoneKey({ kind: "library", scope: "shared" }))?.push(card.id);

    const next = advanceStep(state);

    expect(next.players[0].hand).toEqual([]);
    expect(next.zones.get(zoneKey({ kind: "library", scope: "shared" }))).toEqual([card.id]);
  });

  it("cleanup removes until-end-of-turn effects", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-cleanup",
      rngSeed: "seed-kernel-cleanup"
    });
    const state: GameState = {
      ...withStep(base, "CLEANUP"),
      continuousEffects: [
        {
          id: "effect-kept",
          source: { id: "source-kept", zcc: 0 },
          layer: LAYERS.CONTROL,
          timestamp: 1,
          duration: "permanent",
          appliesTo: { kind: "object", object: { id: "obj-kept", zcc: 0 } },
          effect: { kind: "set_controller", payload: { playerId: "p1" } }
        },
        {
          id: "effect-expired",
          source: { id: "source-expired", zcc: 0 },
          layer: LAYERS.CONTROL,
          timestamp: 2,
          duration: "until_end_of_turn",
          appliesTo: { kind: "object", object: { id: "obj-expired", zcc: 0 } },
          effect: { kind: "set_controller", payload: { playerId: "p2" } }
        }
      ]
    };

    const next = advanceStepWithEvents(state, new Rng(state.rngSeed));

    expect(next.state.turnState.step).toBe("UNTAP");
    expect(next.state.turnState.activePlayerId).toBe("p2");
    expect(next.state.continuousEffects).toEqual([
      {
        id: "effect-kept",
        source: { id: "source-kept", zcc: 0 },
        layer: LAYERS.CONTROL,
        timestamp: 1,
        duration: "permanent",
        appliesTo: { kind: "object", object: { id: "obj-kept", zcc: 0 } },
        effect: { kind: "set_controller", payload: { playerId: "p1" } }
      }
    ]);
    expect(next.events.map((event) => event.type)).toContain("CONTINUOUS_EFFECT_REMOVED");
    const removedEvent = next.events.find(
      (event): event is (typeof next.events)[number] & { type: "CONTINUOUS_EFFECT_REMOVED" } =>
        event.type === "CONTINUOUS_EFFECT_REMOVED"
    );
    expect(removedEvent).toMatchObject({ effectId: "effect-expired" });
  });

  it("cleanup also removes until_cleanup effects", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-cleanup-until-cleanup",
      rngSeed: "seed-kernel-cleanup-until-cleanup"
    });
    const state: GameState = {
      ...withStep(base, "CLEANUP"),
      continuousEffects: [
        {
          id: "effect-cleanup",
          source: { id: "source-cleanup", zcc: 0 },
          layer: LAYERS.CONTROL,
          timestamp: 1,
          duration: "until_cleanup",
          appliesTo: { kind: "object", object: { id: "obj-cleanup", zcc: 0 } },
          effect: { kind: "set_controller", payload: { playerId: "p2" } }
        }
      ]
    };

    const next = advanceStepWithEvents(state, new Rng(state.rngSeed));
    const removedEvents = next.events.filter(
      (event): event is (typeof next.events)[number] & { type: "CONTINUOUS_EFFECT_REMOVED" } =>
        event.type === "CONTINUOUS_EFFECT_REMOVED"
    );

    expect(next.state.continuousEffects).toEqual([]);
    expect(removedEvents.map((event) => event.effectId)).toEqual(["effect-cleanup"]);
  });

  it("cleanup also removes as_long_as effects when their condition is false", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-cleanup-as-long-as",
      rngSeed: "seed-kernel-cleanup-as-long-as"
    });
    const state: GameState = {
      ...withStep(base, "CLEANUP"),
      objectPool: new Map([
        [
          "obj-conditional",
          {
            ...createIsland("obj-conditional", "p1"),
            zone: { kind: "battlefield", scope: "shared" }
          }
        ]
      ]),
      zones: new Map([
        ...base.zones,
        [zoneKey({ kind: "battlefield", scope: "shared" }), ["obj-conditional"]]
      ]),
      continuousEffects: [
        {
          id: "effect-as-long-as",
          source: { id: "source-conditional", zcc: 0 },
          layer: LAYERS.CONTROL,
          timestamp: 1,
          duration: {
            kind: "as_long_as",
            condition: { kind: "defender_controls_land_type", landType: "Island" }
          },
          appliesTo: { kind: "object", object: { id: "obj-conditional", zcc: 0 } },
          effect: { kind: "set_controller", payload: { playerId: "p2" } }
        }
      ]
    };

    const next = advanceStepWithEvents(state, new Rng(state.rngSeed));
    const removedEvents = next.events.filter(
      (event): event is (typeof next.events)[number] & { type: "CONTINUOUS_EFFECT_REMOVED" } =>
        event.type === "CONTINUOUS_EFFECT_REMOVED"
    );

    expect(next.state.continuousEffects).toEqual([]);
    expect(removedEvents.map((event) => event.effectId)).toEqual(["effect-as-long-as"]);
  });

  it("resets pass flags when entering a new priority step", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "kernel-priority-reset",
      rngSeed: "seed-kernel-priority-reset"
    });
    const state = withStep(
      {
        ...base,
        turnState: {
          ...base.turnState,
          phase: "MAIN_1",
          step: "MAIN_1",
          priorityState: {
            playerWithPriority: "p1",
            activePlayerPassed: true,
            nonActivePlayerPassed: true
          }
        }
      },
      "MAIN_1"
    );

    const stepped = advanceStep(state);
    expect(stepped.turnState.step).toBe("BEGIN_COMBAT");
    expect(stepped.turnState.priorityState).toEqual(createInitialPriorityState("p1"));

    const afterSinglePass = handlePassPriority(stepped, "p1");
    expect(afterSinglePass).not.toBe("both_passed");
  });
});
