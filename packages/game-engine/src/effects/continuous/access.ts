import type { DerivedGameObjectView } from "../../state/gameObject";
import type { GameState } from "../../state/gameState";
import { computeGameObject, getApplicableContinuousEffects, type ContinuousEffect } from "./layers";

export function getComputedObjectView(
  state: Readonly<GameState>,
  objectId: string
): DerivedGameObjectView | undefined {
  if (!state.objectPool.has(objectId)) {
    return undefined;
  }

  return computeGameObject(objectId, state);
}

export function getApplicableEffectsForObject(
  state: Readonly<GameState>,
  objectId: string
): readonly ContinuousEffect[] {
  if (!state.objectPool.has(objectId)) {
    return [];
  }

  return getApplicableContinuousEffects(objectId, state);
}
