import { describe, expect, it } from "vitest";

import { applyActions } from "../../../src/actions/executor";
import { advanceStepWithEvents } from "../../../src/engine/kernel";
import {
  addContinuousEffect,
  computeGameObject,
  getApplicableContinuousEffects,
  LAYERS
} from "../../../src/effects/continuous/layers";
import { Rng } from "../../../src/rng/rng";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState } from "../../../src/state/gameState";
import { zoneKey } from "../../../src/state/zones";
import { getLegalCommands } from "../../../src/commands/validate";
import { assertStateInvariants } from "../../helpers/invariants";

function baseAction() {
  return {
    source: null,
    controller: "p1" as const,
    appliedReplacements: []
  };
}

function putOnBattlefield(
  state: ReturnType<typeof createInitialGameState>,
  object: GameObject
): void {
  const battlefieldKey = zoneKey(object.zone);
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function makeBattlefieldObject(id: string, cardDefId: string, controller: "p1" | "p2"): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: controller,
    controller,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" }
  };
}

describe("effects/continuous/control", () => {
  it("applies a Layer 2 control effect to the derived view", () => {
    const state = createInitialGameState("p1", "p2", { id: "control-layer-2", rngSeed: "seed" });
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p1"));

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-control",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });

    expect(computeGameObject("obj-a", withControlEffect).controller).toBe("p2");
  });

  it("applies multiple control changes in timestamp order", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "control-timestamp-order",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p1"));

    const withFirst = addContinuousEffect(state, {
      id: "effect-first",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });
    const withSecond = addContinuousEffect(withFirst, {
      id: "effect-second",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    expect(computeGameObject("obj-a", withSecond).controller).toBe("p1");
    expect(getApplicableContinuousEffects("obj-a", withSecond).map((effect) => effect.id)).toEqual([
      "effect-first",
      "effect-second"
    ]);
  });

  it("SET_CONTROL creates the required continuous effect", () => {
    const state = createInitialGameState("p1", "p2", { id: "control-set-action", rngSeed: "seed" });
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p1"));

    const next = applyActions(
      state,
      [
        {
          ...baseAction(),
          id: "control-1",
          type: "SET_CONTROL",
          objectId: "obj-a",
          to: "p2",
          duration: "until_end_of_turn"
        }
      ],
      new Rng(state.rngSeed)
    );

    expect(next.continuousEffects).toHaveLength(1);
    expect(next.continuousEffects[0]).toMatchObject({
      id: "control-1",
      layer: LAYERS.CONTROL,
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });
    expect(computeGameObject("obj-a", next).controller).toBe("p2");
  });

  it("reverts control when the effect expires during cleanup", () => {
    const state = createInitialGameState("p1", "p2", { id: "control-cleanup", rngSeed: "seed" });
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p1"));

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-control",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });
    withControlEffect.turnState.phase = "CLEANUP";
    withControlEffect.turnState.step = "CLEANUP";

    const next = advanceStepWithEvents(withControlEffect, new Rng(withControlEffect.rngSeed));

    expect(next.state.continuousEffects).toEqual([]);
    expect(computeGameObject("obj-a", next.state).controller).toBe("p1");
  });

  it("updates activated ability legality for the new controller", () => {
    const state = createInitialGameState("p1", "p2", { id: "control-activate", rngSeed: "seed" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    state.turnState.priorityState = {
      activePlayerPassed: false,
      nonActivePlayerPassed: false,
      playerWithPriority: "p1"
    };
    state.players[0].priority = true;
    state.players[1].priority = false;
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p2"));

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-control",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    const commands = getLegalCommands(withControlEffect);

    expect(
      commands.some(
        (command) =>
          command.type === "ACTIVATE_ABILITY" &&
          command.sourceId === "obj-a" &&
          command.abilityIndex === 0
      )
    ).toBe(true);
  });

  it("preserves state invariants after control modification", () => {
    const state = createInitialGameState("p1", "p2", { id: "control-invariants", rngSeed: "seed" });
    putOnBattlefield(state, makeBattlefieldObject("obj-a", "island", "p1"));

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-control",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });

    expect(() => assertStateInvariants(withControlEffect)).not.toThrow();
  });
});
