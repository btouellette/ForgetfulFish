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

function cloneDerivedView(view: Readonly<DerivedGameObjectView>): DerivedGameObjectView {
  return {
    ...view,
    counters: new Map(view.counters),
    attachments: [...view.attachments],
    abilities: [...view.abilities]
  };
}

function layerSortKey(layer: Readonly<Layer>): number {
  switch (layer) {
    case LAYERS.COPY:
      return 1;
    case LAYERS.CONTROL:
      return 2;
    case LAYERS.TEXT:
      return 3;
    case LAYERS.TYPE:
      return 4;
    case LAYERS.COLOR:
      return 5;
    case LAYERS.ABILITY:
      return 6;
    case LAYERS.PT_SET:
      return 7.1;
    case LAYERS.PT_ADJUST:
      return 7.2;
    case LAYERS.PT_SWITCH:
      return 7.3;
    default: {
      const neverLayer: never = layer;
      return neverLayer;
    }
  }
}

function sortEffectsForApplication(
  left: Readonly<ContinuousEffect>,
  right: Readonly<ContinuousEffect>
): number {
  const layerDelta = layerSortKey(left.layer) - layerSortKey(right.layer);
  if (layerDelta !== 0) {
    return layerDelta;
  }

  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp;
  }

  return left.id.localeCompare(right.id);
}

function applyEffectToView(
  view: Readonly<DerivedGameObjectView>,
  effect: Readonly<ContinuousEffect>
): DerivedGameObjectView {
  if (effect.layer === LAYERS.CONTROL && effect.effect.kind === "set_controller") {
    const playerId = effect.effect.payload?.playerId;
    if (typeof playerId === "string") {
      return {
        ...view,
        controller: playerId
      };
    }
  }

  return view;
}

export function computeGameObject(
  objectId: string,
  state: Readonly<GameState>
): DerivedGameObjectView {
  const baseObject = state.objectPool.get(objectId);
  if (baseObject === undefined) {
    throw new Error(`object '${objectId}' is missing from state '${state.id}'`);
  }

  const matchingEffects = state.continuousEffects
    .filter((effect) => matchesEffectTarget(effect.appliesTo, baseObject, state))
    .sort(sortEffectsForApplication);

  return matchingEffects.reduce(
    (view, effect) => applyEffectToView(view, effect),
    cloneDerivedView(baseObject)
  );
}

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
