import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { advanceStepWithEvents } from "../../src/engine/kernel";
import {
  addContinuousEffect,
  computeGameObject,
  LAYERS,
  type ContinuousEffect
} from "../../src/effects/continuous/layers";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function makeCard(
  id: string,
  cardDefId: string,
  owner: "p1" | "p2",
  zone: GameObject["zone"],
  overrides: Partial<GameObject> = {}
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone,
    ...overrides
  };
}

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function makeTextChangeEffect(
  id: string,
  timestamp: number,
  duration: ContinuousEffect["duration"],
  payload: Record<string, unknown>
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-dandan", zcc: 0 },
    layer: LAYERS.TEXT,
    timestamp,
    duration,
    appliesTo: { kind: "object", object: { id: "obj-dandan", zcc: 0 } },
    effect: {
      kind: "text_change",
      payload
    }
  };
}

function makeTargetEffect(
  id: string,
  layer: ContinuousEffect["layer"],
  timestamp: number,
  effect: ContinuousEffect["effect"],
  duration: ContinuousEffect["duration"] = "until_end_of_turn"
): ContinuousEffect {
  return {
    id,
    source: { id: "obj-dandan", zcc: 0 },
    layer,
    timestamp,
    duration,
    appliesTo: { kind: "object", object: { id: "obj-dandan", zcc: 0 } },
    effect
  };
}

function createDandanState(): GameState {
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "layer-interactions-test",
    rngSeed: "layer-interactions-seed"
  });

  putOnBattlefield(
    state,
    makeCard(
      "obj-dandan",
      dandanCardDefinition.id,
      "p1",
      { kind: "battlefield", scope: "shared" },
      {
        counters: new Map([["+1/+1", 1]])
      }
    )
  );

  expect(() => assertStateInvariants(state)).not.toThrow();
  return state;
}

function addEffect(state: GameState, effect: ContinuousEffect): GameState {
  const nextState = addContinuousEffect(state, effect);
  expect(() => assertStateInvariants(nextState)).not.toThrow();
  return nextState;
}

function moveToCleanup(state: GameState): GameState {
  const cleanupState: GameState = {
    ...state,
    turnState: {
      ...state.turnState,
      phase: "CLEANUP",
      step: "CLEANUP"
    }
  };

  const nextState = advanceStepWithEvents(cleanupState, new Rng(cleanupState.rngSeed)).state;
  expect(() => assertStateInvariants(nextState)).not.toThrow();
  return nextState;
}

describe("integration/layer-interactions", () => {
  it("applies the Mind Bend-equivalent permanent text rewrite across Dandan's structured land-type tokens", () => {
    const state = addEffect(
      createDandanState(),
      makeTextChangeEffect("mind-bend", 1, "permanent", {
        fromLandType: "Island",
        toLandType: "Swamp"
      })
    );

    expect(computeGameObject("obj-dandan", state).abilities).toEqual([
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
      }
    ]);
  });

  it("combines Mind Bend- and Crystal Spray-equivalent text changes on the same Dandan", () => {
    const withMindBend = addEffect(
      createDandanState(),
      makeTextChangeEffect("mind-bend", 1, "permanent", {
        fromLandType: "Island",
        toLandType: "Swamp"
      })
    );
    const withCrystalSpray = addEffect(
      withMindBend,
      makeTextChangeEffect("crystal-spray", 2, "until_end_of_turn", {
        fromLandType: "Swamp",
        toLandType: "Mountain",
        instanceId: "keyword:landwalk:0"
      })
    );

    expect(computeGameObject("obj-dandan", withCrystalSpray).abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Mountain" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Swamp" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Swamp"
      }
    ]);
  });

  it("layers Dance of the Skywise-style temporary effects over Dandan and removes only temporary layers at cleanup", () => {
    const withMindBend = addEffect(
      createDandanState(),
      makeTextChangeEffect("mind-bend", 1, "permanent", {
        fromLandType: "Island",
        toLandType: "Swamp"
      })
    );
    const withCrystalSpray = addEffect(
      withMindBend,
      makeTextChangeEffect("crystal-spray", 2, "until_end_of_turn", {
        fromLandType: "Swamp",
        toLandType: "Mountain",
        instanceId: "keyword:landwalk:0"
      })
    );
    const withTypeChange = addEffect(
      withCrystalSpray,
      makeTargetEffect("dance-type", 4, 3, {
        kind: "type_change",
        payload: {
          subtypes: [
            { kind: "creature_type", value: "Dragon" },
            { kind: "creature_type", value: "Illusion" }
          ]
        }
      })
    );
    const withColorChange = addEffect(
      withTypeChange,
      makeTargetEffect("dance-color", 5, 4, {
        kind: "set_color",
        payload: { color: ["blue"] }
      })
    );
    const withRemoveAbilities = addEffect(
      withColorChange,
      makeTargetEffect("dance-remove", 6, 5, { kind: "remove_all_abilities" })
    );
    const withFlying = addEffect(
      withRemoveAbilities,
      makeTargetEffect("dance-flying", 6, 6, {
        kind: "grant_keyword",
        payload: { keyword: "flying" }
      })
    );
    const withBasePt = addEffect(
      withFlying,
      makeTargetEffect("dance-pt", "7a", 7, {
        kind: "set_pt",
        payload: { power: 4, toughness: 4 }
      })
    );

    const duringDance = computeGameObject("obj-dandan", withBasePt);
    expect(duringDance.typeLine).toEqual(["Creature"]);
    expect(duringDance.subtypes).toEqual([
      { kind: "creature_type", value: "Dragon" },
      { kind: "creature_type", value: "Illusion" }
    ]);
    expect(duringDance.color).toEqual(["blue"]);
    expect(duringDance.abilities).toEqual([{ kind: "keyword", keyword: "flying" }]);
    expect(duringDance.power).toBe(5);
    expect(duringDance.toughness).toBe(5);

    const afterCleanup = moveToCleanup(withBasePt);
    const computedAfterCleanup = computeGameObject("obj-dandan", afterCleanup);

    expect(afterCleanup.continuousEffects).toEqual([
      expect.objectContaining({
        id: "mind-bend",
        duration: "permanent",
        layer: 3,
        effect: expect.objectContaining({ kind: "text_change" })
      })
    ]);
    expect(computedAfterCleanup.typeLine).toEqual(["Creature"]);
    expect(computedAfterCleanup.subtypes).toEqual([{ kind: "creature_type", value: "Fish" }]);
    expect(computedAfterCleanup.abilities).toEqual([
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
      }
    ]);
    expect(computedAfterCleanup.power).toBe(5);
    expect(computedAfterCleanup.toughness).toBe(2);
  });
});
