import { beforeEach, describe, expect, it } from "vitest";

import {
  registerPipelineReplacementEffect,
  resetPipelineReplacementRegistry,
  runPipeline,
  runPipelineWithResult
} from "../../src/actions/pipeline";
import type { GameAction } from "../../src/actions/action";
import { createInitialGameState } from "../../src/state/gameState";

function createStateWithObject(objectId: string, zcc: number) {
  const state = createInitialGameState("p1", "p2", { id: "pipeline-test", rngSeed: "seed" });
  const battlefield = state.mode.resolveZone(state, "battlefield", "p1");

  state.objectPool.set(objectId, {
    id: objectId,
    zcc,
    cardDefId: "island",
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: battlefield
  });

  return state;
}

function baseActionFields() {
  return {
    source: null,
    controller: "p1",
    appliedReplacements: [] as string[]
  };
}

describe("actions/pipeline", () => {
  beforeEach(() => {
    resetPipelineReplacementRegistry();
  });

  it("passes actions with valid targets through unchanged", () => {
    const state = createStateWithObject("obj-1", 0);
    const actions: GameAction[] = [
      {
        ...baseActionFields(),
        id: "action-1",
        type: "DEAL_DAMAGE",
        amount: 2,
        target: { kind: "object", object: { id: "obj-1", zcc: 0 } }
      }
    ];

    const result = runPipeline(state, actions);
    expect(result).toEqual(actions);
  });

  it("filters out actions with stale object references", () => {
    const state = createStateWithObject("obj-1", 1);
    const actions: GameAction[] = [
      {
        ...baseActionFields(),
        id: "action-1",
        type: "DEAL_DAMAGE",
        amount: 2,
        target: { kind: "object", object: { id: "obj-1", zcc: 0 } }
      }
    ];

    const result = runPipeline(state, actions);
    expect(result).toEqual([]);
  });

  it("returns a new array and does not mutate input", () => {
    const state = createStateWithObject("obj-1", 0);
    const actions: GameAction[] = [
      {
        ...baseActionFields(),
        id: "action-1",
        type: "COUNTER",
        object: { id: "obj-1", zcc: 0 }
      }
    ];
    const originalSnapshot = structuredClone(actions);

    const result = runPipeline(state, actions);

    expect(result).not.toBe(actions);
    expect(actions).toEqual(originalSnapshot);
  });

  it("returns an empty array for empty input", () => {
    const state = createInitialGameState("p1", "p2", { id: "pipeline-empty", rngSeed: "seed" });

    const result = runPipeline(state, []);
    expect(result).toEqual([]);
  });

  it("processes multiple actions independently", () => {
    const state = createStateWithObject("obj-1", 0);
    const actions: GameAction[] = [
      {
        ...baseActionFields(),
        id: "action-valid",
        type: "COUNTER",
        object: { id: "obj-1", zcc: 0 }
      },
      {
        ...baseActionFields(),
        id: "action-stale",
        type: "COUNTER",
        object: { id: "obj-1", zcc: 9 }
      }
    ];

    const result = runPipeline(state, actions);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("action-valid");
  });

  it("validates target legality for both object refs and player ids", () => {
    const state = createStateWithObject("obj-1", 0);
    const actions: GameAction[] = [
      {
        ...baseActionFields(),
        id: "action-object",
        type: "DEAL_DAMAGE",
        amount: 1,
        target: { kind: "object", object: { id: "obj-1", zcc: 0 } }
      },
      {
        ...baseActionFields(),
        id: "action-player",
        type: "DEAL_DAMAGE",
        amount: 1,
        target: { kind: "player", playerId: "p2" }
      },
      {
        ...baseActionFields(),
        id: "action-bad-player",
        type: "DEAL_DAMAGE",
        amount: 1,
        target: { kind: "player", playerId: "p3" }
      }
    ];

    const result = runPipeline(state, actions);
    expect(result.map((action) => action.id)).toEqual(["action-object", "action-player"]);
  });

  it("applies registered replacement rewrites during rewrite stage", () => {
    const state = createStateWithObject("obj-1", 0);
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-double-damage",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }

        return {
          ...action,
          amount: action.amount * 2
        };
      }
    });

    const result = runPipeline(state, [
      {
        ...baseActionFields(),
        id: "action-damage",
        type: "DEAL_DAMAGE",
        amount: 2,
        target: { kind: "player", playerId: "p2" }
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("DEAL_DAMAGE");
    if (result[0]?.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE result action");
    }
    expect(result[0].amount).toBe(4);
    expect(result[0].appliedReplacements).toEqual(["replace-double-damage"]);
  });

  it("returns pending CHOOSE_REPLACEMENT when same-priority replacements conflict", () => {
    const state = createStateWithObject("obj-1", 0);
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

    const result = runPipelineWithResult(state, [
      {
        ...baseActionFields(),
        id: "action-damage",
        type: "DEAL_DAMAGE",
        amount: 2,
        target: { kind: "player", playerId: "p2" }
      }
    ]);

    expect(result.pendingChoice?.type).toBe("CHOOSE_REPLACEMENT");
    if (result.pendingChoice?.type !== "CHOOSE_REPLACEMENT") {
      throw new Error("expected CHOOSE_REPLACEMENT pending choice");
    }
    expect(result.pendingChoice.constraints.replacements).toEqual(["replace-a", "replace-b"]);
  });

  it("automatically applies highest-priority replacement before lower priorities", () => {
    const state = createStateWithObject("obj-1", 0);
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-low",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount + 1 };
      },
      priority: 1
    });
    registerPipelineReplacementEffect("DEAL_DAMAGE", {
      id: "replace-high",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      rewrite: (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount + 2 };
      },
      priority: 5
    });

    const result = runPipeline(state, [
      {
        ...baseActionFields(),
        id: "action-damage",
        type: "DEAL_DAMAGE",
        amount: 1,
        target: { kind: "player", playerId: "p2" }
      }
    ]);

    expect(result).toHaveLength(1);
    if (result[0]?.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE result action");
    }
    expect(result[0].amount).toBe(4);
    expect(result[0].appliedReplacements).toEqual(["replace-high", "replace-low"]);
  });
});
