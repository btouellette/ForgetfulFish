import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  registerPipelineReplacementEffect,
  resetPipelineReplacementRegistry
} from "../../src/actions/pipeline";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { cardRegistry, islandCardDefinition } from "../../src/cards";
import { processCommand } from "../../src/engine/processCommand";
import { resolveTopOfStack } from "../../src/stack/resolve";
import { type StackItem } from "../../src/stack/stackItem";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { Rng } from "../../src/rng/rng";

function makeStackSpellObject(id: string): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: islandCardDefinition.id,
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
}

function makeDamageAction(actionId: string) {
  return {
    id: actionId,
    type: "DEAL_DAMAGE" as const,
    source: { id: "obj-spell", zcc: 0 },
    controller: "p1" as const,
    amount: 2,
    target: { kind: "player" as const, playerId: "p2" as const },
    appliedReplacements: []
  };
}

const replacementResumeCardDefinition: CardDefinition = {
  id: "replacement-resume-card",
  name: "Replacement Resume Card",
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
  onResolve: [{ id: "SEARCH_LIBRARY_SHUFFLE_TOP", typeFilter: ["Instant"], min: 0, max: 1 }],
  continuousEffects: [],
  replacementEffects: []
};

describe("stack/resolve pipeline choice integration", () => {
  beforeEach(() => {
    resetPipelineReplacementRegistry();
    cardRegistry.set(islandCardDefinition.id, islandCardDefinition);
  });

  afterEach(() => {
    resetPipelineReplacementRegistry();
  });

  it("pauses resolution with CHOOSE_REPLACEMENT when pipeline rewrite requires a choice", () => {
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-a",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-b",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });

    const state = createInitialGameState("p1", "p2", {
      id: "resolve-pipeline-choice",
      rngSeed: "resolve-pipeline-choice-seed"
    });

    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    const object = makeStackSpellObject("obj-spell");
    state.objectPool.set(object.id, object);
    state.zones.set(stackKey, [object.id]);

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
        whiteboard: {
          actions: [makeDamageAction("action-damage")],
          scratch: {}
        }
      }
    };
    state.stack = [stackItem];

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));

    expect(result.pendingChoice?.type).toBe("CHOOSE_REPLACEMENT");
    if (result.pendingChoice?.type !== "CHOOSE_REPLACEMENT") {
      throw new Error("expected CHOOSE_REPLACEMENT pending choice");
    }
    expect(result.pendingChoice.constraints.replacements).toEqual(["replace-a", "replace-b"]);

    const top = result.state.stack[result.state.stack.length - 1];
    expect(top?.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: result.pendingChoice.id
    });
  });

  it("continues resolution after CHOOSE_REPLACEMENT is provided", () => {
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-a",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-b",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });

    const state = createInitialGameState("p1", "p2", {
      id: "resolve-pipeline-choice-resume",
      rngSeed: "resolve-pipeline-choice-resume-seed"
    });

    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    const object = makeStackSpellObject("obj-spell");
    state.objectPool.set(object.id, object);
    state.zones.set(stackKey, [object.id]);

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
        whiteboard: {
          actions: [makeDamageAction("action-damage")],
          scratch: {}
        }
      }
    };
    state.stack = [stackItem];

    const firstResolve = resolveTopOfStack(state, new Rng(state.rngSeed));
    expect(firstResolve.pendingChoice?.type).toBe("CHOOSE_REPLACEMENT");
    if (firstResolve.pendingChoice?.type !== "CHOOSE_REPLACEMENT") {
      throw new Error("expected CHOOSE_REPLACEMENT pending choice");
    }

    const resumed = processCommand(
      firstResolve.state,
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_REPLACEMENT", replacementId: "replace-a" }
      },
      new Rng(firstResolve.state.rngSeed)
    );

    expect(resumed.pendingChoice).toBeNull();
    expect(resumed.nextState.pendingChoice).toBeNull();
    expect(resumed.nextState.stack).toHaveLength(0);
  });

  it("applies pipeline actions to game state when no replacement choice is required", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "resolve-pipeline-actions-executed",
      rngSeed: "resolve-pipeline-actions-executed-seed"
    });

    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    const object = makeStackSpellObject("obj-spell");
    state.objectPool.set(object.id, object);
    state.zones.set(stackKey, [object.id]);

    const stackItem: StackItem = {
      id: "stack-item-action-exec",
      object: { id: object.id, zcc: object.zcc },
      controller: "p1",
      targets: [],
      effectContext: {
        stackItemId: "stack-item-action-exec",
        source: { id: object.id, zcc: object.zcc },
        controller: "p1",
        targets: [],
        cursor: { kind: "start" },
        whiteboard: {
          actions: [makeDamageAction("action-damage")],
          scratch: {}
        }
      }
    };
    state.stack = [stackItem];

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));

    expect(result.pendingChoice).toBeNull();
    expect(result.state.players[1].life).toBe(18);
    expect(result.state.stack).toHaveLength(0);
  });

  it("does not re-run onResolve handlers after resuming pipeline replacement choice", () => {
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-a",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-b",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => action,
      priority: 1
    });

    cardRegistry.set(replacementResumeCardDefinition.id, replacementResumeCardDefinition);
    const state = createInitialGameState("p1", "p2", {
      id: "resolve-pipeline-replacement-resume",
      rngSeed: "resolve-pipeline-replacement-resume-seed"
    });

    const libraryZone = state.mode.resolveZone(state, "library", "p1");
    const libraryKey = zoneKey(libraryZone);
    state.objectPool.set("obj-lib-island", {
      id: "obj-lib-island",
      zcc: 0,
      cardDefId: islandCardDefinition.id,
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: libraryZone
    });
    state.zones.set(libraryKey, ["obj-lib-island"]);

    const stackZone = state.mode.resolveZone(state, "stack", "p1");
    const stackKey = zoneKey(stackZone);
    const object: GameObject = {
      id: "obj-resume",
      zcc: 0,
      cardDefId: replacementResumeCardDefinition.id,
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
    state.zones.set(stackKey, [object.id]);

    const stackItem: StackItem = {
      id: "stack-item-resume",
      object: { id: object.id, zcc: object.zcc },
      controller: "p1",
      targets: [],
      effectContext: {
        stackItemId: "stack-item-resume",
        source: { id: object.id, zcc: object.zcc },
        controller: "p1",
        targets: [],
        cursor: { kind: "start" },
        whiteboard: {
          actions: [makeDamageAction("action-damage")],
          scratch: {}
        }
      }
    };
    state.stack = [stackItem];

    const firstResolve = resolveTopOfStack(state, new Rng(state.rngSeed));
    expect(firstResolve.pendingChoice?.type).toBe("CHOOSE_CARDS");
    if (firstResolve.pendingChoice?.type !== "CHOOSE_CARDS") {
      throw new Error("expected CHOOSE_CARDS pending choice");
    }

    const chooseCards = processCommand(
      firstResolve.state,
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_CARDS", selected: [], min: 0, max: 1 }
      },
      new Rng(firstResolve.state.rngSeed)
    );

    expect(chooseCards.pendingChoice?.type).toBe("CHOOSE_REPLACEMENT");
    if (chooseCards.pendingChoice?.type !== "CHOOSE_REPLACEMENT") {
      throw new Error("expected CHOOSE_REPLACEMENT pending choice");
    }

    const chooseReplacement = processCommand(
      chooseCards.nextState,
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_REPLACEMENT", replacementId: "replace-a" }
      },
      new Rng(chooseCards.nextState.rngSeed)
    );

    const shuffledEvents = [...chooseCards.newEvents, ...chooseReplacement.newEvents].filter(
      (event) => event.type === "SHUFFLED"
    );

    expect(shuffledEvents).toHaveLength(1);
    expect(chooseReplacement.pendingChoice).toBeNull();
    expect(chooseReplacement.nextState.stack).toHaveLength(0);
  });
});
