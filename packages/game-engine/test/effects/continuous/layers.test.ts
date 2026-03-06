import { describe, expect, it } from "vitest";

import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../../src/state/gameState";
import {
  LAYERS,
  addContinuousEffect,
  matchesEffectTarget,
  removeContinuousEffect,
  type ContinuousEffect
} from "../../../src/effects/continuous/layers";

function makeObject(id: string, cardDefId: string): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" }
  };
}

function createStateWithObjects(): GameState {
  const state = createInitialGameState("p1", "p2", { id: "layers-test", rngSeed: "layers-seed" });
  const objectA = makeObject("obj-a", "island");
  const objectB = makeObject("obj-b", "memory-lapse");
  state.objectPool.set(objectA.id, objectA);
  state.objectPool.set(objectB.id, objectB);
  return state;
}

function createEffect(id: string, timestamp = 1): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.CONTROL,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", objectId: "obj-a" },
    effect: {
      kind: "set_controller",
      payload: { playerId: "p2" }
    }
  };
}

describe("effects/continuous/layers", () => {
  it("adds a continuous effect with a unique id", () => {
    const state = createStateWithObjects();
    const nextState = addContinuousEffect(state, createEffect("effect-1"));

    expect(nextState.continuousEffects).toHaveLength(1);
    expect(nextState.continuousEffects[0]?.id).toBe("effect-1");
  });

  it("removes a continuous effect by id", () => {
    const state = addContinuousEffect(createStateWithObjects(), createEffect("effect-1"));
    const nextState = removeContinuousEffect(state, "effect-1");

    expect(nextState.continuousEffects).toHaveLength(0);
  });

  it("stores effect metadata including layer and timestamp", () => {
    const state = createStateWithObjects();
    const nextState = addContinuousEffect(state, createEffect("effect-meta", 7));
    const effect = nextState.continuousEffects[0];

    expect(effect?.layer).toBe(LAYERS.CONTROL);
    expect(effect?.timestamp).toBe(7);
    expect(effect?.duration).toBe("until_end_of_turn");
  });

  it("appliesTo filter can identify valid targets", () => {
    const state = createStateWithObjects();
    const effect = createEffect("effect-targeting");
    const objectA = state.objectPool.get("obj-a");
    const objectB = state.objectPool.get("obj-b");
    if (objectA === undefined || objectB === undefined) {
      throw new Error("expected test objects to exist");
    }

    expect(matchesEffectTarget(effect.appliesTo, objectA, state)).toBe(true);
    expect(matchesEffectTarget(effect.appliesTo, objectB, state)).toBe(false);
  });

  it("tracks multiple continuous effects simultaneously", () => {
    const withFirst = addContinuousEffect(createStateWithObjects(), createEffect("effect-1", 1));
    const withSecond = addContinuousEffect(withFirst, createEffect("effect-2", 2));

    expect(withSecond.continuousEffects).toHaveLength(2);
    expect(withSecond.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-1",
      "effect-2"
    ]);
  });

  it("does not mutate the original state when adding effects", () => {
    const state = createStateWithObjects();
    const nextState = addContinuousEffect(state, createEffect("effect-immutable"));

    expect(state.continuousEffects).toHaveLength(0);
    expect(nextState.continuousEffects).toHaveLength(1);
    expect(nextState).not.toBe(state);
  });

  it("rejects duplicate effect ids on add", () => {
    const withFirst = addContinuousEffect(createStateWithObjects(), createEffect("effect-dup"));

    expect(() => addContinuousEffect(withFirst, createEffect("effect-dup", 2))).toThrow(
      "continuous effect 'effect-dup' already exists"
    );
  });
});
