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

function makeSetPtEffect(
  id: string,
  timestamp: number,
  power: number,
  toughness: number,
  dependsOn?: ContinuousEffect["dependsOn"]
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.PT_SET,
    sublayer: LAYERS.PT_SET,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "set_pt",
      payload: { power, toughness }
    },
    ...(dependsOn === undefined ? {} : { dependsOn })
  };
}

describe("effects/continuous/compute", () => {
  it("includes base power and toughness from the card definition in the derived view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-base-pt-test",
      rngSeed: "compute-base-pt-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const computed = computeGameObject("obj-a", state);

    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(1);
  });

  it("keeps non-creature power and toughness null in the derived view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-null-pt-test",
      rngSeed: "compute-null-pt-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "island"));

    const computed = computeGameObject("obj-a", state);

    expect(computed.power).toBeNull();
    expect(computed.toughness).toBeNull();
  });

  it("applies Layer 7a set_pt effects to the derived view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-set-pt-test",
      rngSeed: "compute-set-pt-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("effect-set-pt", 1, 4, 4));

    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(4);
  });

  it("applies same-layer set_pt effects in timestamp order", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-set-pt-timestamp-test",
      rngSeed: "compute-set-pt-timestamp-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withFirst = addContinuousEffect(state, makeSetPtEffect("effect-first", 1, 5, 5));
    const withSecond = addContinuousEffect(withFirst, makeSetPtEffect("effect-second", 2, 2, 2));

    const computed = computeGameObject("obj-a", withSecond);

    expect(computed.power).toBe(2);
    expect(computed.toughness).toBe(2);
  });

  it("respects same-layer dependencies for set_pt effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-set-pt-dependency-test",
      rngSeed: "compute-set-pt-dependency-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withDependent = addContinuousEffect(
      state,
      makeSetPtEffect("effect-a", 1, 5, 5, [{ effectId: "effect-b" }])
    );
    const withDependency = addContinuousEffect(withDependent, makeSetPtEffect("effect-b", 2, 1, 1));

    expect(computeGameObject("obj-a", withDependency).power).toBe(5);
    expect(computeGameObject("obj-a", withDependency).toughness).toBe(5);
    expect(
      getApplicableContinuousEffects("obj-a", withDependency).map((effect) => effect.id)
    ).toEqual(["effect-b", "effect-a"]);
  });

  it("applies +1/+1 counters after Layer 7a set_pt effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-counter-adjust-after-set-pt-test",
      rngSeed: "compute-counter-adjust-after-set-pt-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "dandan"),
      counters: new Map([["+1/+1", 1]])
    });

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("effect-set-pt", 1, 4, 4));
    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(5);
    expect(computed.toughness).toBe(5);
  });

  it("accumulates multiple +1/+1 counters in Layer 7b", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-multiple-counter-adjust-test",
      rngSeed: "compute-multiple-counter-adjust-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "dandan"),
      counters: new Map([["+1/+1", 2]])
    });

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("effect-set-pt", 1, 4, 4));
    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(6);
    expect(computed.toughness).toBe(6);
  });

  it("applies -1/-1 counters in Layer 7b", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-negative-counter-adjust-test",
      rngSeed: "compute-negative-counter-adjust-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "dandan"),
      counters: new Map([["-1/-1", 1]])
    });

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("effect-set-pt", 1, 4, 4));
    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(3);
    expect(computed.toughness).toBe(3);
  });

  it("nets +1/+1 and -1/-1 counters before later Layer 7c work", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "compute-net-counter-adjust-test",
      rngSeed: "compute-net-counter-adjust-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "dandan"),
      counters: new Map([
        ["+1/+1", 2],
        ["-1/-1", 2]
      ])
    });

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("effect-set-pt", 1, 4, 4));
    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(4);
  });

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
