import type { GameAction } from "./action";
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

function rewriteStage(state: Readonly<GameState>, actions: readonly GameAction[]): PipelineResult {
  const rewritten: GameAction[] = [];

  for (const action of actions) {
    const replacementResult = applyReplacementEffects(action, state, defaultReplacementRegistry);
    rewritten.push(replacementResult.action);
    if (replacementResult.kind === "choice_required") {
      return {
        actions: rewritten,
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
  const rewritten = rewriteStage(state, actions);
  const filtered = filterStage(state, rewritten.actions);
  const redirected = redirectStage(state, filtered);
  return augmentStage(state, redirected);
}

export function runPipelineWithResult(
  state: Readonly<GameState>,
  actions: readonly GameAction[]
): PipelineResult {
  const rewritten = rewriteStage(state, actions);
  const filtered = filterStage(state, rewritten.actions);
  const redirected = redirectStage(state, filtered);
  return {
    actions: augmentStage(state, redirected),
    pendingChoice: rewritten.pendingChoice
  };
}
