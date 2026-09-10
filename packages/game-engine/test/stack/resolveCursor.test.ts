import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CardDefinition } from "../../src/cards/cardDefinition";
import { cardRegistry } from "../../src/cards";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import { resolveTopOfStack } from "../../src/stack/resolve";
import type { StackItem } from "../../src/stack/stackItem";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";

const pausingCardDefinition: CardDefinition = {
  id: "resolve-cursor-card",
  name: "Resolve Cursor Card",
  manaCost: { blue: 1 },
  typeLine: ["Instant"],
  subtypes: [],
  color: ["blue"],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [
    { kind: "draw_cards", count: 1, player: "controller" },
    {
      kind: "choose_mode",
      prompt: "Choose a mode",
      storeKey: "resolve-cursor:mode",
      modeSource: {
        kind: "explicit",
        modes: [{ id: "mode-a" }, { id: "mode-b" }]
      }
    },
    { kind: "draw_cards", count: 1, player: "controller" }
  ],
  continuousEffects: [],
  replacementEffects: []
};

function buildState(): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "resolve-cursor",
    rngSeed: "resolve-cursor-seed"
  });

  const object: GameObject = {
    id: "obj-spell",
    zcc: 0,
    cardDefId: pausingCardDefinition.id,
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "stack", scope: "shared" }
  };

  state.objectPool.set(object.id, object);
  state.zones.set(zoneKey(state.mode.resolveZone(state, "stack", "p1")), [object.id]);

  const libraryKey = zoneKey(state.mode.resolveZone(state, "library", "p1"));
  const libraryIds: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const card: GameObject = {
      ...object,
      id: `obj-library-${index}`,
      cardDefId: "island",
      zone: { kind: "library", scope: "shared" }
    };
    state.objectPool.set(card.id, card);
    libraryIds.push(card.id);
  }
  state.zones.set(libraryKey, libraryIds);

  const stackItem: StackItem = {
    id: "stack-item-1",
    object: { id: object.id, zcc: object.zcc },
    controller: "p1",
    targets: [],
    effectContext: {
      stackItemId: "stack-item-1",
      source: { id: object.id, zcc: object.zcc },
      controller: "p1",
      targets: [],
      cursor: { kind: "start" },
      whiteboard: { actions: [], scratch: {} }
    }
  };
  state.stack = [stackItem];

  return state;
}

describe("stack/resolve cursor", () => {
  beforeEach(() => {
    cardRegistry.set(pausingCardDefinition.id, pausingCardDefinition);
  });

  afterEach(() => {
    cardRegistry.delete(pausingCardDefinition.id);
  });

  it("records the paused node path and keeps no legacy resume bookkeeping in scratch", () => {
    const state = buildState();

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));

    expect(result.pendingChoice?.type).toBe("CHOOSE_MODE");
    const top = result.state.stack[result.state.stack.length - 1];
    expect(top?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: result.pendingChoice?.id,
      resumePath: [1],
      phase: "effects"
    });
    expect(Object.keys(top?.effectContext.whiteboard.scratch ?? {})).toEqual([
      "resolve-cursor:mode:choiceId"
    ]);
  });

  it("resumes at the paused node without re-running earlier effects", () => {
    const state = buildState();
    const paused = resolveTopOfStack(state, new Rng(state.rngSeed));
    const pausedState: GameState = {
      ...paused.state,
      players: [
        { ...paused.state.players[0], priority: true },
        { ...paused.state.players[1], priority: false }
      ],
      turnState: {
        ...paused.state.turnState,
        priorityState: { ...paused.state.turnState.priorityState, playerWithPriority: "p1" }
      }
    };
    const handAfterFirstDraw = pausedState.players[0].hand.length;

    const resumed = processCommand(
      pausedState,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: "mode-a" } } },
      new Rng(pausedState.rngSeed)
    );

    expect(resumed.nextState.pendingChoice).toBeNull();
    expect(resumed.nextState.stack).toHaveLength(0);
    expect(resumed.nextState.players[0].hand).toHaveLength(handAfterFirstDraw + 1);
  });
});
