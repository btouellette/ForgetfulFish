import type { DerivedGameObjectView } from "../../state/gameObject";
import type { GameState } from "../../state/gameState";
import { getComputedObjectAccess, type ContinuousEffect } from "./layers";

export function getComputedObjectAccessForObject(
  state: Readonly<GameState>,
  objectId: string
): {
  view: DerivedGameObjectView;
  appliedEffects: readonly ContinuousEffect[];
} | null {
  return getComputedObjectAccess(objectId, state);
}

export function getComputedObjectView(
  state: Readonly<GameState>,
  objectId: string
): DerivedGameObjectView | undefined {
  return getComputedObjectAccessForObject(state, objectId)?.view;
}

export function getApplicableEffectsForObject(
  state: Readonly<GameState>,
  objectId: string
): readonly ContinuousEffect[] {
  return getComputedObjectAccessForObject(state, objectId)?.appliedEffects ?? [];
}
