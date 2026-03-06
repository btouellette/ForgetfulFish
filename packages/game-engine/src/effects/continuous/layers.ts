import type { ConditionAst, Duration } from "../../cards/abilityAst";
import type { GameObjectView } from "../../state/gameObject";
import type { GameState } from "../../state/gameState";
import type { ObjectRef } from "../../state/objectRef";

export const LAYERS = {
  COPY: 1,
  CONTROL: 2,
  TEXT: 3,
  TYPE: 4,
  COLOR: 5,
  ABILITY: 6,
  PT_SET: "7a",
  PT_ADJUST: "7b",
  PT_SWITCH: "7c"
} as const;

export type Layer = (typeof LAYERS)[keyof typeof LAYERS];

export type Sublayer = Extract<Layer, "7a" | "7b" | "7c">;

export type EffectTarget = (view: Readonly<GameObjectView>, state: Readonly<GameState>) => boolean;

export type ContinuousEffect = {
  id: string;
  source: ObjectRef;
  layer: Layer;
  sublayer?: Sublayer;
  timestamp: number;
  duration: Duration;
  appliesTo: EffectTarget;
  apply: (view: Readonly<GameObjectView>) => GameObjectView;
  dependsOn?: (other: Readonly<ContinuousEffect>, state: Readonly<GameState>) => boolean;
  condition?: ConditionAst;
};

export function addContinuousEffect(
  state: Readonly<GameState>,
  effect: ContinuousEffect
): GameState {
  return {
    ...state,
    continuousEffects: [...state.continuousEffects, effect]
  };
}

export function removeContinuousEffect(state: Readonly<GameState>, effectId: string): GameState {
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter((effect) => effect.id !== effectId)
  };
}
