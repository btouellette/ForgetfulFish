import type { GameAction } from "./action";
import type { ReplacementId } from "./action";
import { applyReplacementEffects } from "../effects/replacement/applyOnce";
import {
  ReplacementRegistry,
  type ReplacementEffectDefinition
} from "../effects/replacement/registry";
import type { PendingChoice } from "../state/gameState";
import type { GameState } from "../state/gameState";

let defaultReplacementRegistry = new ReplacementRegistry();

export function registerPipelineReplacementEffect(
  actionType: GameAction["type"],
  effect: ReplacementEffectDefinition
): void {
  defaultReplacementRegistry.register(actionType, effect);
}

export function resetPipelineReplacementRegistry(): void {
  defaultReplacementRegistry = new ReplacementRegistry();
}

export type PipelineResult = {
  actions: GameAction[];
  pendingChoice: PendingChoice | null;
};

export type PipelineOptions = {
  replacementSelections?: ReadonlyMap<string, ReplacementId>;
};

function isExistingPlayerId(state: Readonly<GameState>, playerId: string): boolean {
  return state.players.some((player) => player.id === playerId);
}

function isLiveObjectRef(
  state: Readonly<GameState>,
  object: {
    id: string;
    zcc: number;
  }
): boolean {
  const currentObject = state.objectPool.get(object.id);
  return currentObject !== undefined && currentObject.zcc === object.zcc;
}

function replacementChoiceIdFor(action: Readonly<GameAction>): string {
  return `choice:replacement:${action.id}:${action.appliedReplacements.length}`;
}

function replacementChoiceActionId(choice: PendingChoice | null): string | null {
  if (choice?.type !== "CHOOSE_REPLACEMENT") {
    return null;
  }

  const match = /^choice:replacement:(.+):\d+$/.exec(choice.id);
  return match?.[1] ?? null;
}

function rewriteStage(
  state: Readonly<GameState>,
  actions: readonly GameAction[],
  options: PipelineOptions
): PipelineResult {
  const rewritten: GameAction[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const replacementResult = applyReplacementEffects(action, state, defaultReplacementRegistry, {
      chooseReplacement: (currentAction, candidates) => {
        const selected = options.replacementSelections?.get(replacementChoiceIdFor(currentAction));
        if (selected === undefined) {
          return null;
        }

        return candidates.some((candidate) => candidate.id === selected) ? selected : null;
      }
    });
    rewritten.push(replacementResult.action);

    if (replacementResult.kind === "choice_required") {
      return {
        actions: [...rewritten, ...actions.slice(index + 1)],
        pendingChoice: replacementResult.pendingChoice
      };
    }
  }

  return {
    actions: rewritten,
    pendingChoice: null
  };
}

function isLegalTargetedAction(state: Readonly<GameState>, action: GameAction): boolean {
  if (action.type === "DEAL_DAMAGE") {
    if (action.target.kind === "object") {
      return isLiveObjectRef(state, action.target.object);
    }

    return isExistingPlayerId(state, action.target.playerId);
  }

  if (action.type === "COUNTER") {
    return isLiveObjectRef(state, action.object);
  }

  return true;
}

function filterStage(state: Readonly<GameState>, actions: readonly GameAction[]): GameAction[] {
  return actions.filter((action) => isLegalTargetedAction(state, action));
}

function redirectStage(_state: Readonly<GameState>, actions: GameAction[]): GameAction[] {
  return actions;
}

function augmentStage(_state: Readonly<GameState>, actions: GameAction[]): GameAction[] {
  return actions;
}

export function runPipeline(
  state: Readonly<GameState>,
  actions: readonly GameAction[]
): GameAction[] {
  const result = runPipelineWithResult(state, actions);
  if (result.pendingChoice !== null) {
    throw new Error("runPipeline cannot drop pending choice; use runPipelineWithResult");
  }

  return result.actions;
}

export function runPipelineWithResult(
  state: Readonly<GameState>,
  actions: readonly GameAction[],
  options: PipelineOptions = {}
): PipelineResult {
  const rewritten = rewriteStage(state, actions, options);
  const filtered = filterStage(state, rewritten.actions);
  const redirected = redirectStage(state, filtered);
  const finalActions = augmentStage(state, redirected);
  const pendingChoiceActionId = replacementChoiceActionId(rewritten.pendingChoice);
  const hasPendingChoiceAction =
    pendingChoiceActionId === null ||
    finalActions.some((action) => action.id === pendingChoiceActionId);

  return {
    actions: finalActions,
    pendingChoice: hasPendingChoiceAction ? rewritten.pendingChoice : null
  };
}
