import { describe, expect, it } from "vitest";

import {
  LAYERS,
  addContinuousEffect,
  computeGameObject,
  type ContinuousEffect
} from "../../../src/effects/continuous/layers";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState } from "../../../src/state/gameState";

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

function makeSetPtEffect(
  id: string,
  timestamp: number,
  power: number,
  toughness: number
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
    }
  };
}

function makeAdjustPtEffect(
  id: string,
  timestamp: number,
  powerDelta: number,
  toughnessDelta: number
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.PT_ADJUST,
    sublayer: LAYERS.PT_ADJUST,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "adjust_pt",
      payload: { powerDelta, toughnessDelta }
    }
  };
}

function makeSwitchPtEffect(id: string, timestamp: number): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.PT_SWITCH,
    sublayer: LAYERS.PT_SWITCH,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "switch_pt"
    }
  };
}

describe("effects/continuous/pt", () => {
  it("applies Layer 7a setting effects to exact power and toughness", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-layer-7a-test",
      rngSeed: "pt-layer-7a-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("set-pt", 1, 4, 4));
    const computed = computeGameObject("obj-a", withSetPt);

    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(4);
  });

  it("applies generalized Layer 7b adjustments after Layer 7a", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-layer-7b-test",
      rngSeed: "pt-layer-7b-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("set-pt", 1, 4, 4));
    const withAdjustment = addContinuousEffect(withSetPt, makeAdjustPtEffect("adjust-pt", 2, 1, 1));
    const computed = computeGameObject("obj-a", withAdjustment);

    expect(computed.power).toBe(5);
    expect(computed.toughness).toBe(5);
  });

  it("applies Layer 7c switching after setting and adjustment effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-layer-7c-test",
      rngSeed: "pt-layer-7c-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("set-pt", 1, 4, 4));
    const withAdjustment = addContinuousEffect(withSetPt, makeAdjustPtEffect("adjust-pt", 2, 1, 2));
    const withSwitch = addContinuousEffect(withAdjustment, makeSwitchPtEffect("switch-pt", 3));
    const computed = computeGameObject("obj-a", withSwitch);

    expect(computed.power).toBe(6);
    expect(computed.toughness).toBe(5);
  });

  it("switches printed power and toughness without a preceding Layer 7a effect", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-switch-printed-pt-test",
      rngSeed: "pt-switch-printed-pt-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSwitch = addContinuousEffect(state, makeSwitchPtEffect("switch-pt", 1));
    const computed = computeGameObject("obj-a", withSwitch);

    expect(computed.power).toBe(1);
    expect(computed.toughness).toBe(4);
  });

  it("accumulates multiple generalized Layer 7b adjustments", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-multiple-adjustments-test",
      rngSeed: "pt-multiple-adjustments-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withFirstAdjustment = addContinuousEffect(
      state,
      makeAdjustPtEffect("adjust-pt-a", 1, 1, 1)
    );
    const withSecondAdjustment = addContinuousEffect(
      withFirstAdjustment,
      makeAdjustPtEffect("adjust-pt-b", 2, 2, 0)
    );
    const computed = computeGameObject("obj-a", withSecondAdjustment);

    expect(computed.power).toBe(7);
    expect(computed.toughness).toBe(2);
  });

  it("combines explicit Layer 7b adjustments with synthetic counter adjustments", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-adjustment-plus-counters-test",
      rngSeed: "pt-adjustment-plus-counters-seed"
    });
    state.objectPool.set("obj-a", {
      ...makeObject("obj-a", "dandan"),
      counters: new Map([["+1/+1", 1]])
    });

    const withAdjustment = addContinuousEffect(state, makeAdjustPtEffect("adjust-pt", 1, 1, 0));
    const computed = computeGameObject("obj-a", withAdjustment);

    expect(computed.power).toBe(6);
    expect(computed.toughness).toBe(2);
  });

  it("preserves negative power and toughness from stacked Layer 7 adjustments", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "pt-negative-adjustments-test",
      rngSeed: "pt-negative-adjustments-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withSetPt = addContinuousEffect(state, makeSetPtEffect("set-pt", 1, 1, 1));
    const withAdjustment = addContinuousEffect(
      withSetPt,
      makeAdjustPtEffect("adjust-pt", 2, -2, -3)
    );
    const computed = computeGameObject("obj-a", withAdjustment);

    expect(computed.power).toBe(-1);
    expect(computed.toughness).toBe(-2);
  });
});
