import type { GameAction, ReplacementId } from "../../actions/action";
import { cardRegistry } from "../../cards";
import type { ConditionAst } from "../../cards/abilityAst";
import type { PendingChoice } from "../../choices/pendingChoice";
import type { GameState } from "../../state/gameState";
import { zoneKey } from "../../state/zones";
import type { ReplacementEffectDefinition, ReplacementRegistry } from "./registry";

export type ApplyReplacementEffectsResult =
  | { kind: "applied"; action: GameAction }
  | { kind: "choice_required"; action: GameAction; pendingChoice: PendingChoice };

function withAppliedReplacement(action: GameAction, replacementId: ReplacementId): GameAction {
  if (action.appliedReplacements.includes(replacementId)) {
    return action;
  }

  return {
    ...action,
    appliedReplacements: [...action.appliedReplacements, replacementId]
  };
}

function findDefendingPlayerId(state: Readonly<GameState>, attackerId: string): string | null {
  const defender = state.players.find((player) => player.id !== attackerId);
  return defender?.id ?? null;
}

function evaluatesTrue(
  condition: ConditionAst | undefined,
  action: GameAction,
  state: Readonly<GameState>
): boolean {
  if (condition === undefined) {
    return true;
  }

  if (condition.kind === "defender_controls_land_type") {
    const defenderId = findDefendingPlayerId(state, action.controller);
    if (defenderId === null) {
      return false;
    }

    const battlefieldZone = state.mode.resolveZone(state, "battlefield", defenderId);
    const battlefieldIds = state.zones.get(zoneKey(battlefieldZone));
    if (battlefieldIds === undefined) {
      return false;
    }

    return battlefieldIds.some((objectId) => {
      const object = state.objectPool.get(objectId);
      if (object === undefined) {
        return false;
      }

      const definition = cardRegistry.get(object.cardDefId);
      if (definition === undefined) {
        return false;
      }

      return definition.subtypes.some(
        (subtype) => subtype.kind === "basic_land_type" && subtype.value === condition.landType
      );
    });
  }

  return false;
}

function pendingChoiceFor(
  action: GameAction,
  candidates: ReplacementEffectDefinition[]
): PendingChoice {
  return {
    id: `choice:replacement:${action.id}`,
    type: "CHOOSE_REPLACEMENT",
    forPlayer: action.controller,
    prompt: "Choose which replacement effect applies first",
    constraints: {
      replacements: candidates.map((candidate) => candidate.id)
    }
  };
}

export function applyReplacementEffects(
  action: GameAction,
  state: Readonly<GameState>,
  registry: ReplacementRegistry
): ApplyReplacementEffectsResult {
  let currentAction = { ...action, appliedReplacements: [...action.appliedReplacements] };
  let iterations = 0;

  while (iterations < 100) {
    iterations += 1;
    const excludedIds = new Set(currentAction.appliedReplacements);
    const candidates = registry
      .matching(currentAction, state, excludedIds)
      .filter((effect) => evaluatesTrue(effect.condition, currentAction, state));

    if (candidates.length === 0) {
      return { kind: "applied", action: currentAction };
    }

    if (candidates.length > 1) {
      return {
        kind: "choice_required",
        action: currentAction,
        pendingChoice: pendingChoiceFor(currentAction, candidates)
      };
    }

    const candidate = candidates[0];
    if (candidate === undefined) {
      return { kind: "applied", action: currentAction };
    }

    const rewritten = candidate.rewrite(currentAction, state);
    currentAction = withAppliedReplacement(rewritten, candidate.id);
  }

  throw new Error("replacement effect loop exceeded maximum iterations");
}
