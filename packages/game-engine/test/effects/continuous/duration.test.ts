import { afterEach, describe, expect, it, vi } from "vitest";

import {
  removeAsLongAsEffects,
  cleanupUntilCleanupEffects,
  cleanupExpiredEffects,
  removeSourceGoneEffects
} from "../../../src/effects/continuous/duration";
import * as layers from "../../../src/effects/continuous/layers";
import { LAYERS, type ContinuousEffect } from "../../../src/effects/continuous/layers";
import type { GameEvent } from "../../../src/events/event";
import type { GameObject } from "../../../src/state/gameObject";
import { createInitialGameState } from "../../../src/state/gameState";
import { zoneKey } from "../../../src/state/zones";

function isContinuousEffectRemovedEvent(
  event: GameEvent
): event is Extract<GameEvent, { type: "CONTINUOUS_EFFECT_REMOVED" }> {
  return event.type === "CONTINUOUS_EFFECT_REMOVED";
}

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

function putOnBattlefield(
  state: ReturnType<typeof createInitialGameState>,
  object: GameObject
): void {
  const battlefieldKey = zoneKey(object.zone);
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

describe("effects/continuous/duration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const removedEvents = result.events.filter(isContinuousEffectRemovedEvent);
    expect(removedEvents.map((event) => event.effectId)).toEqual(["effect-a", "effect-b"]);
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

  it("does not remove until_cleanup effects during end-of-turn cleanup", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-until-cleanup-persist",
      rngSeed: "seed"
    });
    state.continuousEffects = [makeEffect("effect-cleanup", "until_cleanup", 1)];

    const result = cleanupExpiredEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-cleanup"]);
    expect(result.events).toEqual([]);
  });

  it("removes until_cleanup effects during cleanup-step cleanup", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-until-cleanup-remove",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      makeEffect("effect-cleanup", "until_cleanup", 1),
      makeEffect("effect-permanent", "permanent", 2)
    ];

    const result = cleanupUntilCleanupEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-permanent"]);
  });

  it("emits removal events for each until_cleanup effect removed during cleanup-step cleanup", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-until-cleanup-events",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      makeEffect("effect-a", "until_cleanup", 1),
      makeEffect("effect-b", "until_cleanup", 2)
    ];

    const result = cleanupUntilCleanupEffects(state);

    const removedEvents = result.events.filter(isContinuousEffectRemovedEvent);
    expect(removedEvents.map((event) => event.effectId)).toEqual(["effect-a", "effect-b"]);
    expect(result.state.version).toBe(state.version + 2);
  });

  it("lets until_cleanup effects survive end-of-turn cleanup but removes them in cleanup-step cleanup", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-until-cleanup-sequence",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      makeEffect("effect-eot", "until_end_of_turn", 1),
      makeEffect("effect-cleanup", "until_cleanup", 2)
    ];

    const afterEotCleanup = cleanupExpiredEffects(state);
    const afterCleanupStep = cleanupUntilCleanupEffects(afterEotCleanup.state);

    expect(afterEotCleanup.state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-cleanup"
    ]);
    expect(afterCleanupStep.state.continuousEffects).toEqual([]);
  });

  it("removes as_long_as effects when their condition becomes false", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-as-long-as-false",
      rngSeed: "seed"
    });
    putOnBattlefield(state, {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.continuousEffects = [
      makeEffect(
        "effect-as-long-as",
        {
          kind: "as_long_as",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        1
      )
    ];

    const result = removeAsLongAsEffects(state);

    expect(result.state.continuousEffects).toEqual([]);
    expect(result.events.map((event) => event.type)).toEqual(["CONTINUOUS_EFFECT_REMOVED"]);
    const removedEvent = result.events.find(isContinuousEffectRemovedEvent);
    expect(removedEvent?.effectId).toBe("effect-as-long-as");
  });

  it("preserves as_long_as effects while their condition remains true", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-as-long-as-true",
      rngSeed: "seed"
    });
    putOnBattlefield(state, {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    putOnBattlefield(state, {
      id: "obj-defender-island",
      zcc: 0,
      cardDefId: "island",
      owner: "p2",
      controller: "p2",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.continuousEffects = [
      makeEffect(
        "effect-as-long-as",
        {
          kind: "as_long_as",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        1
      )
    ];

    const result = removeAsLongAsEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-as-long-as"
    ]);
    expect(result.events).toEqual([]);
  });

  it("only recomputes the targeted object for object-scoped as_long_as effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-as-long-as-object-only",
      rngSeed: "seed"
    });
    putOnBattlefield(state, {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    putOnBattlefield(state, {
      id: "obj-extra",
      zcc: 0,
      cardDefId: "island",
      owner: "p2",
      controller: "p2",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.continuousEffects = [
      makeEffect(
        "effect-as-long-as-object-only",
        {
          kind: "as_long_as",
          condition: { kind: "defender_controls_land_type", landType: "Island" }
        },
        1
      )
    ];

    const computeSpy = vi.spyOn(layers, "computeGameObject");

    removeAsLongAsEffects(state);

    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(computeSpy).toHaveBeenCalledWith(
      "obj-a",
      expect.objectContaining({
        continuousEffects: []
      })
    );
  });

  it("skips non-battlefield objects when evaluating broad as_long_as effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-as-long-as-battlefield-only",
      rngSeed: "seed"
    });
    putOnBattlefield(state, {
      id: "obj-a",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.objectPool.set("obj-graveyard", {
      id: "obj-graveyard",
      zcc: 0,
      cardDefId: "island",
      owner: "p2",
      controller: "p2",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "graveyard", scope: "shared" }
    });
    state.continuousEffects = [
      {
        ...makeEffect(
          "effect-as-long-as-controller",
          {
            kind: "as_long_as",
            condition: { kind: "defender_controls_land_type", landType: "Island" }
          },
          1
        ),
        appliesTo: { kind: "controller", playerId: "p1" }
      }
    ];

    const computeSpy = vi.spyOn(layers, "computeGameObject");

    removeAsLongAsEffects(state);

    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(computeSpy).toHaveBeenCalledWith(
      "obj-a",
      expect.objectContaining({
        continuousEffects: []
      })
    );
  });

  it("removes while_source_on_battlefield effects when the source leaves the battlefield", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-gone",
      rngSeed: "seed"
    });
    state.objectPool.set("source-a", {
      id: "source-a",
      zcc: 1,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "graveyard", scope: "shared" }
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-source", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      }
    ];

    const result = removeSourceGoneEffects(state);

    expect(result.state.continuousEffects).toEqual([]);
    expect(result.events.map((event) => event.type)).toEqual(["CONTINUOUS_EFFECT_REMOVED"]);
    const removedEvent = result.events.find(isContinuousEffectRemovedEvent);
    expect(removedEvent?.effectId).toBe("effect-source");
  });

  it("preserves while_source_on_battlefield effects while the source is still on the battlefield", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-present",
      rngSeed: "seed"
    });
    state.objectPool.set("source-a", {
      id: "source-a",
      zcc: 1,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-source", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      }
    ];

    const result = removeSourceGoneEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-source"]);
    expect(result.events).toEqual([]);
  });

  it("emits removal events for each expired while_source_on_battlefield effect", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-events",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-a", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      },
      {
        ...makeEffect("effect-b", "while_source_on_battlefield", 2),
        source: { id: "source-b", zcc: 1 }
      }
    ];

    const result = removeSourceGoneEffects(state);

    expect(result.events.map((event) => event.type)).toEqual([
      "CONTINUOUS_EFFECT_REMOVED",
      "CONTINUOUS_EFFECT_REMOVED"
    ]);
    const removedEvents = result.events.filter(isContinuousEffectRemovedEvent);
    expect(removedEvents.map((event) => event.effectId)).toEqual(["effect-a", "effect-b"]);
  });

  it("does not remove other duration kinds when source-based effects expire", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-mixed",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-source", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      },
      makeEffect("effect-permanent", "permanent", 2),
      makeEffect("effect-eot", "until_end_of_turn", 3)
    ];

    const result = removeSourceGoneEffects(state);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-permanent",
      "effect-eot"
    ]);
  });

  it("removes while_source_on_battlefield effects when the source zcc no longer matches", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-zcc",
      rngSeed: "seed"
    });
    state.objectPool.set("source-a", {
      id: "source-a",
      zcc: 2,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-source", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      }
    ];

    const result = removeSourceGoneEffects(state);

    expect(result.state.continuousEffects).toEqual([]);
  });

  it("does not mutate the original state when removing source-gone effects", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "duration-source-immutable",
      rngSeed: "seed"
    });
    state.continuousEffects = [
      {
        ...makeEffect("effect-source", "while_source_on_battlefield", 1),
        source: { id: "source-a", zcc: 1 }
      },
      makeEffect("effect-kept", "permanent", 2)
    ];

    const result = removeSourceGoneEffects(state);

    expect(state.continuousEffects.map((effect) => effect.id)).toEqual([
      "effect-source",
      "effect-kept"
    ]);
    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-kept"]);
  });
});
