import { describe, expect, it } from "vitest";

import type { DealDamageAction, GameAction } from "../../../src/actions/action";
import { applyReplacementEffects } from "../../../src/effects/replacement/applyOnce";
import {
  ReplacementRegistry,
  type ReplacementEffectDefinition
} from "../../../src/effects/replacement/registry";
import { createInitialGameState } from "../../../src/state/gameState";

function createState() {
  return createInitialGameState("p1", "p2", { id: "replacement-test", rngSeed: "seed" });
}

function baseDamageAction(): DealDamageAction {
  return {
    id: "action-damage",
    type: "DEAL_DAMAGE",
    source: null,
    controller: "p1",
    appliedReplacements: [],
    amount: 2,
    target: { kind: "player", playerId: "p2" }
  };
}

function replacement(
  id: string,
  rewrite: (action: GameAction) => GameAction
): ReplacementEffectDefinition {
  return {
    id,
    appliesTo: (action) => action.type === "DEAL_DAMAGE",
    rewrite: (action) => rewrite(action)
  };
}

describe("effects/replacement", () => {
  it("rewrites an action and tracks replacement id in appliedReplacements", () => {
    const registry = new ReplacementRegistry();
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-double", (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount * 2 };
      })
    );

    const result = applyReplacementEffects(baseDamageAction(), createState(), registry);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") {
      throw new Error("expected applied result");
    }

    expect(result.action.type).toBe("DEAL_DAMAGE");
    if (result.action.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE action");
    }
    expect(result.action.amount).toBe(4);
    expect(result.action.appliedReplacements).toEqual(["replace-double"]);
  });

  it("does not re-apply a replacement that already modified the action", () => {
    const registry = new ReplacementRegistry();
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-double", (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount * 2 };
      })
    );

    const action = baseDamageAction();
    action.appliedReplacements = ["replace-double"];

    const result = applyReplacementEffects(action, createState(), registry);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") {
      throw new Error("expected applied result");
    }

    expect(result.action.type).toBe("DEAL_DAMAGE");
    if (result.action.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE action");
    }
    expect(result.action.amount).toBe(2);
    expect(result.action.appliedReplacements).toEqual(["replace-double"]);
  });

  it("returns a CHOOSE_REPLACEMENT pending choice when multiple replacements apply", () => {
    const registry = new ReplacementRegistry();
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-a", (action) => ({
        ...action,
        appliedReplacements: action.appliedReplacements
      }))
    );
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-b", (action) => ({
        ...action,
        appliedReplacements: action.appliedReplacements
      }))
    );

    const result = applyReplacementEffects(baseDamageAction(), createState(), registry);
    expect(result.kind).toBe("choice_required");
    if (result.kind !== "choice_required") {
      throw new Error("expected choice_required result");
    }

    expect(result.pendingChoice.type).toBe("CHOOSE_REPLACEMENT");
    if (result.pendingChoice.type !== "CHOOSE_REPLACEMENT") {
      throw new Error("expected CHOOSE_REPLACEMENT choice");
    }
    expect(result.pendingChoice.constraints.replacements.sort()).toEqual([
      "replace-a",
      "replace-b"
    ]);
  });

  it("terminates the replacement loop without re-applying previously used ids", () => {
    const registry = new ReplacementRegistry();
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-step-1", (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount + 1 };
      })
    );
    registry.register(
      "DEAL_DAMAGE",
      replacement("replace-step-2", (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount + 1 };
      })
    );

    const seededAction: DealDamageAction = {
      ...baseDamageAction(),
      appliedReplacements: ["replace-step-2"]
    };

    const result = applyReplacementEffects(seededAction, createState(), registry);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") {
      throw new Error("expected applied result");
    }

    expect(result.action.type).toBe("DEAL_DAMAGE");
    if (result.action.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE action");
    }
    expect(result.action.amount).toBe(3);
    expect(result.action.appliedReplacements).toEqual(["replace-step-2", "replace-step-1"]);
  });

  it("evaluates replacement conditions before applying", () => {
    const registry = new ReplacementRegistry();
    registry.register("DEAL_DAMAGE", {
      id: "replace-conditioned",
      appliesTo: (action) => action.type === "DEAL_DAMAGE",
      condition: { kind: "defender_controls_land_type", landType: "Island" },
      rewrite: (action) => {
        if (action.type !== "DEAL_DAMAGE") {
          return action;
        }
        return { ...action, amount: action.amount + 5 };
      }
    });

    const result = applyReplacementEffects(baseDamageAction(), createState(), registry);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") {
      throw new Error("expected applied result");
    }

    expect(result.action.type).toBe("DEAL_DAMAGE");
    if (result.action.type !== "DEAL_DAMAGE") {
      throw new Error("expected DEAL_DAMAGE action");
    }
    expect(result.action.amount).toBe(2);
    expect(result.action.appliedReplacements).toEqual([]);
  });

  it("leaves unmatched actions unchanged", () => {
    const registry = new ReplacementRegistry();
    registry.register(
      "DRAW",
      replacement("replace-draw", (action) => {
        if (action.type !== "DRAW") {
          return action;
        }
        return { ...action, count: action.count + 1 };
      })
    );

    const result = applyReplacementEffects(baseDamageAction(), createState(), registry);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") {
      throw new Error("expected applied result");
    }

    expect(result.action).toEqual(baseDamageAction());
  });
});
