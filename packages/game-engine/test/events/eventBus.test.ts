import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { LAYERS, addContinuousEffect } from "../../src/effects/continuous/layers";
import { emitEvents } from "../../src/events/eventBus";
import { createEvent, type GameEvent } from "../../src/events/event";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const vanillaDefinition: CardDefinition = {
  id: "event-bus-vanilla",
  name: "Event Bus Vanilla",
  manaCost: {},
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: [],
  supertypes: [],
  power: 1,
  toughness: 1,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const triggerOnZoneChangeDefinition: CardDefinition = {
  ...vanillaDefinition,
  id: "event-bus-zone-change",
  name: "Event Bus Zone Change",
  triggeredAbilities: [{ kind: "trigger", event: "ZONE_CHANGE" }]
};

const triggerOnPriorityDefinition: CardDefinition = {
  ...vanillaDefinition,
  id: "event-bus-priority",
  name: "Event Bus Priority",
  triggeredAbilities: [{ kind: "trigger", event: "PRIORITY_PASSED" }]
};

function putOnBattlefield(state: GameState, objectId: string, cardDefId: string): void {
  const battlefield = state.mode.resolveZone(state, "battlefield", "p1");
  const object: GameObject = {
    id: objectId,
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
    zone: battlefield
  };

  state.objectPool.set(object.id, object);
  state.zones.get(zoneKey(battlefield))?.push(object.id);
}

function makeEvents(state: GameState): [GameEvent, GameEvent] {
  const zoneChangeEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    state.version + 1,
    {
      type: "ZONE_CHANGE",
      objectId: "obj-z",
      oldZcc: 0,
      newZcc: 1,
      from: { kind: "library", scope: "shared" },
      to: { kind: "graveyard", scope: "shared" },
      toIndex: 0
    }
  );
  const priorityEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    state.version + 2,
    {
      type: "PRIORITY_PASSED",
      playerId: "p1"
    }
  );

  return [zoneChangeEvent, priorityEvent];
}

describe("events/eventBus", () => {
  it("keeps triggerQueue empty when no triggered abilities exist", () => {
    cardRegistry.set(vanillaDefinition.id, vanillaDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-1", rngSeed: "seed-1" });
    putOnBattlefield(state, "obj-a", vanillaDefinition.id);
    const [zoneChangeEvent] = makeEvents(state);

    const nextState = emitEvents(state, [zoneChangeEvent]);

    expect(nextState.triggerQueue).toEqual([]);
  });

  it("scans objectPool permanents and their triggeredAbilities", () => {
    cardRegistry.set(triggerOnZoneChangeDefinition.id, triggerOnZoneChangeDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-2", rngSeed: "seed-2" });
    putOnBattlefield(state, "obj-trigger", triggerOnZoneChangeDefinition.id);
    const [zoneChangeEvent] = makeEvents(state);

    const nextState = emitEvents(state, [zoneChangeEvent]);

    expect(nextState.triggerQueue).toHaveLength(1);
    expect(nextState.triggerQueue[0]?.id).toContain("obj-trigger");
  });

  it("scans all emitted events for all battlefield permanents", () => {
    cardRegistry.set(triggerOnZoneChangeDefinition.id, triggerOnZoneChangeDefinition);
    cardRegistry.set(triggerOnPriorityDefinition.id, triggerOnPriorityDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-3", rngSeed: "seed-3" });
    putOnBattlefield(state, "obj-zone", triggerOnZoneChangeDefinition.id);
    putOnBattlefield(state, "obj-priority", triggerOnPriorityDefinition.id);
    const [zoneChangeEvent, priorityEvent] = makeEvents(state);

    const nextState = emitEvents(state, [zoneChangeEvent, priorityEvent]);

    expect(nextState.triggerQueue).toHaveLength(2);
    expect(nextState.triggerQueue.some((trigger) => trigger.id.includes("obj-zone"))).toBe(true);
    expect(nextState.triggerQueue.some((trigger) => trigger.id.includes("obj-priority"))).toBe(
      true
    );
  });

  it("updates GameState id and version to highest emitted event sequence", () => {
    cardRegistry.set(vanillaDefinition.id, vanillaDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-4", rngSeed: "seed-4" });
    putOnBattlefield(state, "obj-a", vanillaDefinition.id);
    const [zoneChangeEvent] = makeEvents(state);
    const customSeqEvent = {
      ...zoneChangeEvent,
      seq: state.version + 7
    };

    const nextState = emitEvents(state, [customSeqEvent]);

    expect(nextState.id).not.toBe(state.id);
    expect(nextState.version).toBe(customSeqEvent.seq);
  });

  it("uses max event seq when multiple events are emitted", () => {
    cardRegistry.set(vanillaDefinition.id, vanillaDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-4b", rngSeed: "seed-4b" });
    putOnBattlefield(state, "obj-a", vanillaDefinition.id);
    const [zoneChangeEvent, priorityEvent] = makeEvents(state);
    const eventWithLowerSeq = { ...zoneChangeEvent, seq: state.version + 2 };
    const eventWithHigherSeq = { ...priorityEvent, seq: state.version + 9 };

    const nextState = emitEvents(state, [eventWithLowerSeq, eventWithHigherSeq]);

    expect(nextState.version).toBe(eventWithHigherSeq.seq);
  });

  it("preserves game state invariants after event emission", () => {
    cardRegistry.set(triggerOnZoneChangeDefinition.id, triggerOnZoneChangeDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-5", rngSeed: "seed-5" });
    putOnBattlefield(state, "obj-trigger", triggerOnZoneChangeDefinition.id);
    const [zoneChangeEvent] = makeEvents(state);

    const nextState = emitEvents(state, [zoneChangeEvent]);

    expect(() => assertStateInvariants(nextState)).not.toThrow();
  });

  it("has no side effects when there are no events to scan", () => {
    cardRegistry.set(triggerOnZoneChangeDefinition.id, triggerOnZoneChangeDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-6", rngSeed: "seed-6" });
    putOnBattlefield(state, "obj-trigger", triggerOnZoneChangeDefinition.id);

    const nextState = emitEvents(state, []);

    expect(nextState.id).toBe(state.id);
    expect(nextState.version).toBe(state.version);
    expect(nextState.triggerQueue).toEqual(state.triggerQueue);
  });

  it("reads triggered abilities from the computed object view", () => {
    const textTriggerDefinition: CardDefinition = {
      ...vanillaDefinition,
      id: "event-bus-text-trigger",
      name: "Event Bus Text Trigger",
      triggeredAbilities: [{ kind: "trigger", event: "ZONE_CHANGE" }]
    };
    cardRegistry.set(textTriggerDefinition.id, textTriggerDefinition);
    const state = createInitialGameState("p1", "p2", { id: "event-bus-7", rngSeed: "seed-7" });
    putOnBattlefield(state, "obj-trigger", textTriggerDefinition.id);

    const withTextChange = addContinuousEffect(state, {
      id: "effect-text-change",
      source: { id: "obj-trigger", zcc: 0 },
      layer: LAYERS.TEXT,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-trigger", zcc: 0 } },
      effect: {
        kind: "text_change",
        payload: { fromLandType: "Island", toLandType: "Swamp" }
      }
    });
    const [zoneChangeEvent] = makeEvents(withTextChange);

    const nextState = emitEvents(withTextChange, [zoneChangeEvent]);

    expect(nextState.triggerQueue).toHaveLength(1);
    expect(nextState.triggerQueue[0]?.id).toContain("obj-trigger");
  });
});
