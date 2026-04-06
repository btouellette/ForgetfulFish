import { describe, expect, it } from "vitest";

import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState } from "../../../src/state/gameState";
import {
  LAYERS,
  addContinuousEffect,
  computeGameObject,
  getApplicableContinuousEffects,
  type ContinuousEffect
} from "../../../src/effects/continuous/layers";
import { zoneKey } from "../../../src/state/zones";

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

function makeControlEffect(
  id: string,
  timestamp: number,
  playerId: string,
  dependsOn?: ContinuousEffect["dependsOn"]
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.CONTROL,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "set_controller",
      payload: { playerId }
    },
    ...(dependsOn === undefined ? {} : { dependsOn })
  };
}

describe("effects/continuous/compute", () => {
  it("applies same-layer dependencies before timestamp ordering", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-dependency-test",
      rngSeed: "compute-dependency-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "island"));

    const withEarlyDependent = addContinuousEffect(
      state,
      makeControlEffect("effect-a", 1, "p1", [{ effectId: "effect-b" }])
    );
    const withLateDependency = addContinuousEffect(
      withEarlyDependent,
      makeControlEffect("effect-b", 2, "p2")
    );

    expect(computeGameObject("obj-a", withLateDependency).controller).toBe("p1");
  });

  it("reports applicable effects in dependency-respected application order", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-applied-order-test",
      rngSeed: "compute-applied-order-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "island"));

    const withEarlyDependent = addContinuousEffect(
      state,
      makeControlEffect("effect-a", 1, "p1", [{ effectId: "effect-b" }])
    );
    const withLateDependency = addContinuousEffect(
      withEarlyDependent,
      makeControlEffect("effect-b", 2, "p2")
    );

    expect(
      getApplicableContinuousEffects("obj-a", withLateDependency).map((effect) => effect.id)
    ).toEqual(["effect-b", "effect-a"]);
  });

  it("falls back to stable timestamp order when dependencies form a cycle", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-cycle-test",
      rngSeed: "compute-cycle-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "island"));

    const withFirst = addContinuousEffect(
      state,
      makeControlEffect("effect-a", 1, "p2", [{ effectId: "effect-b" }])
    );
    const withSecond = addContinuousEffect(
      withFirst,
      makeControlEffect("effect-b", 2, "p1", [{ effectId: "effect-a" }])
    );

    expect(getApplicableContinuousEffects("obj-a", withSecond).map((effect) => effect.id)).toEqual([
      "effect-a",
      "effect-b"
    ]);
    expect(computeGameObject("obj-a", withSecond).controller).toBe("p1");
  });

  it("applies a conditioned continuous effect when the defender controls the required land type", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-condition-applies-test",
      rngSeed: "compute-condition-applies-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "memory-lapse"));
    state.objectPool.set("obj-island", {
      ...makeObject("obj-island", "island"),
      owner: "p2",
      controller: "p2"
    });
    state.zones.set(zoneKey({ kind: "battlefield", scope: "shared" }), ["obj-a", "obj-island"]);

    const withConditionedEffect = addContinuousEffect(state, {
      ...makeControlEffect("effect-conditioned", 1, "p2"),
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    });

    expect(computeGameObject("obj-a", withConditionedEffect).controller).toBe("p2");
  });

  it("skips a conditioned continuous effect when the defender lacks the required land type", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-condition-skips-test",
      rngSeed: "compute-condition-skips-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "memory-lapse"));
    state.zones.set(zoneKey({ kind: "battlefield", scope: "shared" }), ["obj-a"]);

    const withConditionedEffect = addContinuousEffect(state, {
      ...makeControlEffect("effect-conditioned", 1, "p2"),
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    });

    expect(computeGameObject("obj-a", withConditionedEffect).controller).toBe("p1");
  });

  it("does not count the attacker's own land toward defender land conditions", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-condition-defender-only-test",
      rngSeed: "compute-condition-defender-only-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "memory-lapse"));
    state.objectPool.set("obj-attacker-island", {
      ...makeObject("obj-attacker-island", "island"),
      owner: "p1",
      controller: "p1"
    });
    state.zones.set(zoneKey({ kind: "battlefield", scope: "shared" }), [
      "obj-a",
      "obj-attacker-island"
    ]);

    const withConditionedEffect = addContinuousEffect(state, {
      ...makeControlEffect("effect-conditioned", 1, "p2"),
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    });

    expect(computeGameObject("obj-a", withConditionedEffect).controller).toBe("p1");
  });

  it("fails closed when the conditioned object's controller is not a real player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-condition-invalid-controller-test",
      rngSeed: "compute-condition-invalid-controller-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "memory-lapse"),
      controller: "missing-player"
    });
    state.objectPool.set("obj-island", {
      ...makeObject("obj-island", "island"),
      owner: "p2",
      controller: "p2"
    });
    state.zones.set(zoneKey({ kind: "battlefield", scope: "shared" }), ["obj-a", "obj-island"]);

    const withConditionedEffect = addContinuousEffect(state, {
      ...makeControlEffect("effect-conditioned", 1, "p2"),
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    });

    expect(computeGameObject("obj-a", withConditionedEffect).controller).toBe("missing-player");
  });
});
