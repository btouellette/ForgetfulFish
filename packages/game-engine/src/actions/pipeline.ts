import type { GameAction } from "./action";
import type { GameState } from "../state/gameState";

export type PipelineResult = {
  actions: GameAction[];
  pendingChoice: GameState["pendingChoice"];
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

function rewriteStage(
  _state: Readonly<GameState>,
  actions: readonly GameAction[]
): readonly GameAction[] {
  return actions;
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
  const filtered = filterStage(state, rewritten);
  const redirected = redirectStage(state, filtered);
  return augmentStage(state, redirected);
}

export function runPipelineWithResult(
  state: Readonly<GameState>,
  actions: readonly GameAction[]
): PipelineResult {
  return {
    actions: runPipeline(state, actions),
    pendingChoice: null
  };
}
