import { describe, expect, it } from "vitest";

import type { AbilityAst } from "../../../src/cards/abilityAst";
import {
  LAYERS,
  addContinuousEffect,
  computeGameObject,
  getApplicableContinuousEffects,
  type ContinuousEffect
} from "../../../src/effects/continuous/layers";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState } from "../../../src/state/gameState";

function makeObject(id: string, cardDefId: string, abilities: AbilityAst[] = []): GameObject {
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
    abilities,
    zone: { kind: "battlefield", scope: "shared" }
  };
}

function makeTextChangeEffect(
  id: string,
  timestamp: number,
  payload: Record<string, unknown>,
  dependsOn?: ContinuousEffect["dependsOn"]
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.TEXT,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "text_change",
      payload
    },
    ...(dependsOn === undefined ? {} : { dependsOn })
  };
}

describe("effects/continuous/text", () => {
  it("returns the base ability AST when no Layer 3 effects apply", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-no-effects-test",
      rngSeed: "text-no-effects-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" },
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "static",
          staticKind: "when_no_islands_sacrifice",
          landType: "Island"
        }
      ])
    );

    expect(computeGameObject("obj-a", state).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ]);
  });

  it("rewrites matching land-type tokens across keyword, static, and trigger abilities", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-rewrite-abilities-test",
      rngSeed: "text-rewrite-abilities-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" },
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "static",
          staticKind: "when_no_islands_sacrifice",
          landType: "Island"
        },
        {
          kind: "trigger",
          event: "CUSTOM_EVENT",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Island",
        toLandType: "Swamp"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Swamp" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Swamp"
      },
      {
        kind: "trigger",
        event: "CUSTOM_EVENT",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      }
    ]);
  });

  it("applies same-layer text changes in timestamp order", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-timestamp-order-test",
      rngSeed: "text-timestamp-order-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" }
      ])
    );

    const withFirst = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, { fromLandType: "Island", toLandType: "Swamp" })
    );
    const withSecond = addContinuousEffect(
      withFirst,
      makeTextChangeEffect("effect-b", 2, { fromLandType: "Swamp", toLandType: "Mountain" })
    );

    expect(computeGameObject("obj-a", withSecond).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Mountain"
    });
  });

  it("uses dependency ordering when one text change depends on another", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-dependency-order-test",
      rngSeed: "text-dependency-order-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" }
      ])
    );

    const withDependent = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, { fromLandType: "Swamp", toLandType: "Mountain" }, [
        { effectId: "effect-b" }
      ])
    );
    const withDependency = addContinuousEffect(
      withDependent,
      makeTextChangeEffect("effect-b", 2, { fromLandType: "Island", toLandType: "Swamp" })
    );

    expect(
      getApplicableContinuousEffects("obj-a", withDependency).map((effect) => effect.id)
    ).toEqual(["effect-b", "effect-a"]);
    expect(computeGameObject("obj-a", withDependency).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Mountain"
    });
  });

  it("falls back to stable timestamp order for cyclic text-change dependencies", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-cycle-order-test",
      rngSeed: "text-cycle-order-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" }
      ])
    );

    const withFirst = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, { fromLandType: "Swamp", toLandType: "Mountain" }, [
        { effectId: "effect-b" }
      ])
    );
    const withSecond = addContinuousEffect(
      withFirst,
      makeTextChangeEffect("effect-b", 2, { fromLandType: "Island", toLandType: "Swamp" }, [
        { effectId: "effect-a" }
      ])
    );

    expect(getApplicableContinuousEffects("obj-a", withSecond).map((effect) => effect.id)).toEqual([
      "effect-a",
      "effect-b"
    ]);
    expect(computeGameObject("obj-a", withSecond).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Swamp"
    });
  });

  it("ignores text changes whose source token does not match the current ability AST", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-non-matching-token-test",
      rngSeed: "text-non-matching-token-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Swamp",
        toLandType: "Mountain"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Island"
    });
  });

  it("ignores unsupported color-only text change payloads", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-unsupported-color-payload-test",
      rngSeed: "text-unsupported-color-payload-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, { fromColor: "blue", toColor: "red" })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Island"
    });
  });

  it("can rewrite only one selected land-type instance", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-single-instance-test",
      rngSeed: "text-single-instance-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" },
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "static",
          staticKind: "when_no_islands_sacrifice",
          landType: "Island"
        }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Island",
        toLandType: "Swamp",
        instanceId: "static:cant_attack_unless:0"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ]);
  });

  it("distinguishes duplicate semantic instances by occurrence", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-duplicate-instance-test",
      rngSeed: "text-duplicate-instance-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "static",
          staticKind: "cant_attack_unless",
          condition: { kind: "defender_controls_land_type", landType: "Swamp" }
        }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Swamp",
        toLandType: "Mountain",
        instanceId: "static:cant_attack_unless:1"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toEqual([
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Mountain" }
      }
    ]);
  });

  it("distinguishes duplicate landwalk instances by occurrence", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-duplicate-landwalk-instance-test",
      rngSeed: "text-duplicate-landwalk-instance-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        { kind: "keyword", keyword: "landwalk", landType: "Island" },
        { kind: "keyword", keyword: "landwalk", landType: "Swamp" }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Swamp",
        toLandType: "Mountain",
        instanceId: "keyword:landwalk:1"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      { kind: "keyword", keyword: "landwalk", landType: "Mountain" }
    ]);
  });

  it("distinguishes duplicate trigger-condition instances by occurrence", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "text-duplicate-trigger-instance-test",
      rngSeed: "text-duplicate-trigger-instance-seed"
    });
    state.objectPool.set(
      "obj-a",
      makeObject("obj-a", "memory-lapse", [
        {
          kind: "trigger",
          event: "CUSTOM_EVENT",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        {
          kind: "trigger",
          event: "CUSTOM_EVENT",
          condition: { kind: "defender_controls_land_type", landType: "Swamp" }
        }
      ])
    );

    const withTextChange = addContinuousEffect(
      state,
      makeTextChangeEffect("effect-a", 1, {
        fromLandType: "Swamp",
        toLandType: "Mountain",
        instanceId: "trigger:CUSTOM_EVENT:condition:1"
      })
    );

    expect(computeGameObject("obj-a", withTextChange).abilities).toEqual([
      {
        kind: "trigger",
        event: "CUSTOM_EVENT",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "trigger",
        event: "CUSTOM_EVENT",
        condition: { kind: "defender_controls_land_type", landType: "Mountain" }
      }
    ]);
  });
});
