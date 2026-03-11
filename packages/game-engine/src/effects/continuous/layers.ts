import type { ConditionAst, Duration } from "../../cards/abilityAst";
import type { DerivedGameObjectView } from "../../state/gameObject";
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

export type EffectTarget =
  | { kind: "all" }
  | { kind: "object"; objectId: string }
  | { kind: "controller"; playerId: string };

export type ContinuousEffectPayload = {
  kind: string;
  payload?: Record<string, unknown>;
};

export type EffectDependency = {
  effectId: string;
};

export type ContinuousEffect = {
  id: string;
  source: ObjectRef;
  layer: Layer;
  sublayer?: Sublayer;
  timestamp: number;
  duration: Duration;
  appliesTo: EffectTarget;
  effect: ContinuousEffectPayload;
  dependsOn?: EffectDependency[];
  condition?: ConditionAst;
};

export function matchesEffectTarget(
  target: Readonly<EffectTarget>,
  view: Readonly<DerivedGameObjectView>,
  _state: Readonly<GameState>
): boolean {
  switch (target.kind) {
    case "all":
      return true;
    case "object":
      return view.id === target.objectId;
    case "controller":
      return view.controller === target.playerId;
    default: {
      const neverTarget: never = target;
      return neverTarget;
    }
  }
}

export function addContinuousEffect(
  state: Readonly<GameState>,
  effect: ContinuousEffect
): GameState {
  if (state.continuousEffects.some((existingEffect) => existingEffect.id === effect.id)) {
    throw new Error(`continuous effect '${effect.id}' already exists`);
  }

  return {
    ...state,
    continuousEffects: [...state.continuousEffects, effect]
  };
}

export function removeContinuousEffect(state: Readonly<GameState>, effectId: string): GameState {
  const effects = [...state.continuousEffects];
  const index = effects.findIndex((effect) => effect.id === effectId);
  if (index === -1) {
    return {
      ...state,
      continuousEffects: effects
    };
  }

  effects.splice(index, 1);

  return {
    ...state,
    continuousEffects: effects
  };
}
