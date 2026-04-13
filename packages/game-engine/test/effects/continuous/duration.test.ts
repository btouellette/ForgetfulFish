import { describe, expect, it } from "vitest";

import { cleanupExpiredEffects } from "../../../src/effects/continuous/duration";
import { LAYERS, type ContinuousEffect } from "../../../src/effects/continuous/layers";
import { createInitialGameState } from "../../../src/state/gameState";

function makeEffect(
  id: string,
  duration: ContinuousEffect["duration"],
  timestamp: number
): ContinuousEffect {
  return {
    id,
    source: { id: "source-a", zcc: 0 },
    layer: LAYERS.CONTROL,
    timestamp,
    duration,
    appliesTo: { kind: "object", object: { id: "obj-a", zcc: 0 } },
    effect: { kind: "set_controller", payload: { playerId: "p2" } }
  };
}

describe("effects/continuous/duration", () => {
  it("removes until-end-of-turn effects", () => {
    const state = createInitialGameState("p1", "p2", { id: "duration-remove", rngSeed: "seed" });
    state.continuousEffects = [
      makeEffect("effect-expired", "until_end_of_turn", 1),
      makeEffect("effect-kept", "permanent", 2)
    ];

    const result = cleanupExpiredEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-kept"]);
  });

  it("preserves permanent effects across cleanup", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-permanent",
      rngSeed: "seed"
    });
    state.continuousEffects = [makeEffect("effect-kept", "permanent", 1)];

    const result = cleanupExpiredEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-kept"]);
    expect(result.events).toEqual([]);
  });

  it("emits CONTINUOUS_EFFECT_REMOVED for each expired effect", () => {
    const state = createInitialGameState("p1", "p2", { id: "duration-events", rngSeed: "seed" });
    state.continuousEffects = [
      makeEffect("effect-a", "until_end_of_turn", 1),
      makeEffect("effect-b", "until_end_of_turn", 2),
      makeEffect("effect-c", "permanent", 3)
    ];

    const result = cleanupExpiredEffects(state);

    expect(result.events.map((event) => event.type)).toEqual([
      "CONTINUOUS_EFFECT_REMOVED",
      "CONTINUOUS_EFFECT_REMOVED"
    ]);
    expect(result.events.map((event) => event.effectId)).toEqual(["effect-a", "effect-b"]);
    expect(result.state.version).toBe(state.version + 2);
  });

  it("returns no removal events when nothing expires", () => {
    const state = createInitialGameState("p1", "p2", { id: "duration-noop", rngSeed: "seed" });
    state.continuousEffects = [makeEffect("effect-kept", "permanent", 1)];

    const result = cleanupExpiredEffects(state);

    expect(result.events).toEqual([]);
    expect(result.state.continuousEffects).toEqual(state.continuousEffects);
  });

  it("does not mutate the original state", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-immutable",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      makeEffect("effect-expired", "until_end_of_turn", 1),
      makeEffect("effect-kept", "permanent", 2)
    ];

    const result = cleanupExpiredEffects(state);

    expect(state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-expired",
      "effect-kept"
    ]);
    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-kept"]);
  });

  it("preserves unhandled duration kinds for later slices", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-unhandled",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      makeEffect("effect-source", "while_source_on_battlefield", 1),
      makeEffect("effect-cleanup", "until_cleanup", 2),
      makeEffect(
        "effect-as-long-as",
        {
          kind: "as_long_as",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        3
      )
    ];

    const result = cleanupExpiredEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-source",
      "effect-cleanup",
      "effect-as-long-as"
    ]);
    expect(result.events).toEqual([]);
  });
});
