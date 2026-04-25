import { describe, expect, it } from "vitest";

import { assertStateInvariants } from "../../helpers/invariants";
import { createInitialGameState } from "../../../src/state/gameState";
import type { GameObject } from "../../../src/state/gameObject";
import { zoneKey } from "../../../src/state/zones";
import {
  LAYERS,
  addContinuousEffect,
  computeGameObject,
  removeContinuousEffect,
  type ContinuousEffect
} from "../../../src/effects/continuous/layers";

function makeObject(id: string, cardDefId: string, controller: "p1" | "p2" = "p1"): GameObject {
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

function putOnBattlefield(
  state: ReturnType<typeof createInitialGameState>,
  object: GameObject
): void {
  const battlefieldKey = zoneKey(object.zone);
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function createAbilityEffect(
  id: string,
  timestamp: number,
  effect: ContinuousEffect["effect"],
  condition?: ContinuousEffect["condition"]
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-a", zcc: 0 },
    layer: LAYERS.ABILITY,
    timestamp,
    duration: "until_end_of_turn",
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect,
    ...(condition === undefined ? {} : { condition })
  };
}

describe("effects/continuous/ability", () => {
  it("shows Dandan's native islandwalk keyword in the computed view", () => {
    const state = createInitialGameState("p1", "p2", { id: "ability-dandan", rngSeed: "seed" });
    putOnBattlefield(state, makeObject("obj-a", "dandan"));

    expect(computeGameObject("obj-a", state).abilities).toContainEqual({
      kind: "keyword",
      keyword: "landwalk",
      landType: "Island"
    });
  });

  it("removes islandwalk when a loses-all-abilities effect applies", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "ability-remove-all",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeObject("obj-a", "dandan"));

    const withRemoval = addContinuousEffect(
      state,
      createAbilityEffect("effect-remove-all", 1, { kind: "remove_all_abilities" })
    );

    expect(computeGameObject("obj-a", withRemoval).abilities).toEqual([]);
  });

  it("adds multiple keyword abilities in Layer 6", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "ability-multiple-keywords",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeObject("obj-a", "island"));

    const withFlying = addContinuousEffect(
      state,
      createAbilityEffect("effect-flying", 1, {
        kind: "grant_keyword",
        payload: { keyword: "flying" }
      })
    );
    const withFirstStrike = addContinuousEffect(
      withFlying,
      createAbilityEffect("effect-first-strike", 2, {
        kind: "grant_keyword",
        payload: { keyword: "first_strike" }
      })
    );

    expect(computeGameObject("obj-a", withFirstStrike).abilities).toEqual(
      expect.arrayContaining([
        { kind: "keyword", keyword: "flying" },
        { kind: "keyword", keyword: "first_strike" }
      ])
    );
  });

  it("applies ability-granting effects after text and type changes", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "ability-after-text-and-type",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeObject("obj-a", "dandan"));

    const withTextChange = addContinuousEffect(state, {
      id: "effect-text",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.TEXT,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: {
        kind: "text_change",
        payload: { fromLandType: "Island", toLandType: "Swamp" }
      }
    });
    const withTypeChange = addContinuousEffect(withTextChange, {
      id: "effect-type",
      source: { id: "obj-a", zcc: 0 },
      layer: LAYERS.TYPE,
      timestamp: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
      effect: {
        kind: "type_change",
        payload: { subtypes: [{ kind: "creature_type", value: "Dragon" }] }
      }
    });
    const withAbilityGrant = addContinuousEffect(
      withTypeChange,
      createAbilityEffect("effect-flying", 3, {
        kind: "grant_keyword",
        payload: { keyword: "flying" }
      })
    );

    const computed = computeGameObject("obj-a", withAbilityGrant);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Dragon" }]);
    expect(computed.abilities).toEqual(
      expect.arrayContaining([
        { kind: "keyword", keyword: "landwalk", landType: "Swamp" },
        { kind: "keyword", keyword: "flying" }
      ])
    );
  });

  it("applies conditional ability grants only while their condition holds", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "ability-conditional-grant",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeObject("obj-a", "dandan", "p1"));
    putOnBattlefield(state, makeObject("obj-island", "island", "p2"));

    const withConditionalGrant = addContinuousEffect(
      state,
      createAbilityEffect(
        "effect-conditional",
        1,
        { kind: "grant_keyword", payload: { keyword: "first_strike" } },
        { kind: "defender_controls_land_type", landType: "Island" }
      )
    );

    expect(computeGameObject("obj-a", withConditionalGrant).abilities).toEqual(
      expect.arrayContaining([{ kind: "keyword", keyword: "first_strike" }])
    );

    const withoutIsland = removeContinuousEffect(
      {
        ...withConditionalGrant,
        objectPool: new Map(
          [...withConditionalGrant.objectPool.entries()].filter(
            ([objectId]) => objectId !== "obj-island"
          )
        ),
        zones: new Map([[zoneKey({ kind: "battlefield", scope: "shared" }), ["obj-a"]]])
      },
      "missing-effect-id"
    );

    expect(computeGameObject("obj-a", withoutIsland).abilities).not.toContainEqual({
      kind: "keyword",
      keyword: "first_strike"
    });
  });

  it("preserves state invariants during ability computation", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "ability-invariants",
      rngSeed: "seed"
    });
    putOnBattlefield(state, makeObject("obj-a", "dandan"));

    const withEffects = addContinuousEffect(
      addContinuousEffect(
        state,
        createAbilityEffect("effect-remove-all", 1, { kind: "remove_all_abilities" })
      ),
      createAbilityEffect("effect-flying", 2, {
        kind: "grant_keyword",
        payload: { keyword: "flying" }
      })
    );

    computeGameObject("obj-a", withEffects);
    expect(() => assertStateInvariants(withEffects)).not.toThrow();
  });
});
