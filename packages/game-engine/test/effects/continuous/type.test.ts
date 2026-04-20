import { describe, expect, it } from "vitest";

import type { SubtypeAtom } from "../../../src/cards/abilityAst";
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

function makeTypeChangeEffect(
  id: string,
  timestamp: number,
  typeLine: string[],
  subtypes: SubtypeAtom[],
  dependsOn?: ContinuousEffect["dependsOn"]
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.TYPE,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: {
      kind: "type_change",
      payload: { typeLine, subtypes }
    },
    ...(dependsOn === undefined ? {} : { dependsOn })
  };
}

describe("effects/continuous/type", () => {
  it("includes base type line and subtypes from the card definition in the derived view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-base-view-test",
      rngSeed: "type-base-view-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const computed = computeGameObject("obj-a", state);

    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Fish" }]);
  });

  it("returns empty type data when the card definition is missing", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-missing-definition-test",
      rngSeed: "type-missing-definition-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "missing-card"));

    const computed = computeGameObject("obj-a", state);

    expect(computed.typeLine).toEqual([]);
    expect(computed.subtypes).toEqual([]);
  });

  it("applies Layer 4 type_change effects to the derived view", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-change-apply-test",
      rngSeed: "type-change-apply-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withTypeChange = addContinuousEffect(
      state,
      makeTypeChangeEffect(
        "effect-a",
        1,
        ["Creature"],
        [{ kind: "creature_type", value: "Dragon" }]
      )
    );

    const computed = computeGameObject("obj-a", withTypeChange);

    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Dragon" }]);
  });

  it("applies same-layer type changes in timestamp order", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-change-timestamp-test",
      rngSeed: "type-change-timestamp-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withFirst = addContinuousEffect(
      state,
      makeTypeChangeEffect(
        "effect-a",
        1,
        ["Artifact", "Creature"],
        [{ kind: "creature_type", value: "Shapeshifter" }]
      )
    );
    const withSecond = addContinuousEffect(
      withFirst,
      makeTypeChangeEffect(
        "effect-b",
        2,
        ["Creature"],
        [{ kind: "creature_type", value: "Dragon" }]
      )
    );

    const computed = computeGameObject("obj-a", withSecond);

    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Dragon" }]);
  });

  it("respects same-layer dependencies for type changes", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-change-dependency-test",
      rngSeed: "type-change-dependency-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withDependent = addContinuousEffect(
      state,
      makeTypeChangeEffect(
        "effect-a",
        1,
        ["Artifact", "Creature"],
        [{ kind: "creature_type", value: "Shapeshifter" }],
        [{ effectId: "effect-b" }]
      )
    );
    const withDependency = addContinuousEffect(
      withDependent,
      makeTypeChangeEffect(
        "effect-b",
        2,
        ["Creature"],
        [{ kind: "creature_type", value: "Dragon" }]
      )
    );

    const computed = computeGameObject("obj-a", withDependency);

    expect(computed.typeLine).toEqual(["Artifact", "Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Shapeshifter" }]);
  });

  it("applies type changes before later-layer ability grants", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "type-before-ability-test",
      rngSeed: "type-before-ability-seed"
    });
    state.objectPool.set("obj-a", makeObject("obj-a", "dandan"));

    const withTypeChange = addContinuousEffect(
      state,
      makeTypeChangeEffect(
        "effect-type",
        1,
        ["Creature"],
        [{ kind: "creature_type", value: "Dragon" }]
      )
    );
    const withAbilityGrant = addContinuousEffect(withTypeChange, {
      id: "effect-ability",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.ABILITY,
      timestamp: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: {
        kind: "grant_keyword",
        payload: { keyword: "flying" }
      }
    });

    const computed = computeGameObject("obj-a", withAbilityGrant);

    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Dragon" }]);
    expect(computed.abilities).toContainEqual({ kind: "keyword", keyword: "flying" });
  });
});
