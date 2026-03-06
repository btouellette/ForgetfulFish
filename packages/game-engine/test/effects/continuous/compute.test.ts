import { describe, expect, it } from "vitest";

import type { AbilityAst } from "../../../src/cards/abilityAst";
import {
  LAYERS,
  addContinuousEffect,
  computeGameObject,
  type ContinuousEffect,
  type Layer
} from "../../../src/effects/continuous/layers";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../../src/state/gameState";

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

function createState(): GameState {
  const state = createInitialGameState("p1", "p2", { id: "compute-test", rngSeed: "compute-seed" });
  const object = makeObject("obj-a", "island");
  state.objectPool.set(object.id, object);
  return state;
}

function setAbilitiesEffect(id: string, layer: Layer, timestamp: number) {
  const abilities: AbilityAst[] = [{ kind: "keyword", keyword: "flying" }];
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", objectId: "obj-a" },
    effect: {
      kind: "set_abilities",
      payload: { abilities }
    }
  } satisfies ContinuousEffect;
}

describe("effects/continuous/computeGameObject", () => {
  it("returns a view identical to base when no continuous effects apply", () => {
    const state = createState();
    const base = state.objectPool.get("obj-a");
    if (base === undefined) {
      throw new Error("expected obj-a in object pool");
    }

    const view = computeGameObject("obj-a", state);

    expect(view).toEqual(base);
    expect(view).not.toBe(base);
  });

  it("applies a layer 7a effect to modify the derived view", () => {
    const state = createState();
    const withEffect = addContinuousEffect(state, {
      id: "effect-7a",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.PT_SET,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_tapped",
        payload: { tapped: true }
      }
    });

    const view = computeGameObject("obj-a", withEffect);
    expect(view.tapped).toBe(true);
  });

  it("applies layer 3 text and layer 6 ability effects in layer order", () => {
    const state = createState();
    const withText = addContinuousEffect(state, {
      id: "effect-layer-3",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.TEXT,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_abilities",
        payload: { abilities: [] }
      }
    });
    const withAbility = addContinuousEffect(
      withText,
      setAbilitiesEffect("effect-layer-6", LAYERS.ABILITY, 1)
    );

    const view = computeGameObject("obj-a", withAbility);
    expect(view.abilities).toEqual([{ kind: "keyword", keyword: "flying" }]);
  });

  it("applies same-layer effects by timestamp", () => {
    const state = createState();
    const withEarlier = addContinuousEffect(state, {
      id: "effect-earlier",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_controller",
        payload: { playerId: "p2" }
      }
    });
    const withLater = addContinuousEffect(withEarlier, {
      id: "effect-later",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_controller",
        payload: { playerId: "p1" }
      }
    });

    const view = computeGameObject("obj-a", withLater);
    expect(view.controller).toBe("p1");
  });

  it("returns a derived view that contains all base object fields", () => {
    const state = createState();
    const view = computeGameObject("obj-a", state);

    expect(view).toMatchObject({
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      damage: 0,
      tapped: false,
      summoningSick: false,
      zone: { kind: "battlefield", scope: "shared" }
    });
    expect(view.counters).toBeInstanceOf(Map);
    expect(view.attachments).toEqual([]);
    expect(view.abilities).toEqual([]);
  });

  it("applies dependency order before timestamp order within a layer", () => {
    const state = createState();
    const withLaterTimestamp = addContinuousEffect(state, {
      id: "effect-late",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_tapped",
        payload: { tapped: true }
      }
    });
    const withDependency = addContinuousEffect(withLaterTimestamp, {
      id: "effect-early-dependent",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-a" },
      effect: {
        kind: "set_tapped",
        payload: { tapped: false }
      },
      dependsOn: [{ effectId: "effect-late" }]
    });

    const view = computeGameObject("obj-a", withDependency);
    expect(view.tapped).toBe(false);
  });
});
