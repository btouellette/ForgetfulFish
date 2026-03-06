import type { AbilityAst, ConditionAst, Duration } from "../../cards/abilityAst";
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

const LAYER_ORDER: Layer[] = [
  LAYERS.COPY,
  LAYERS.CONTROL,
  LAYERS.TEXT,
  LAYERS.TYPE,
  LAYERS.COLOR,
  LAYERS.ABILITY,
  LAYERS.PT_SET,
  LAYERS.PT_ADJUST,
  LAYERS.PT_SWITCH
];

function cloneObjectView(view: Readonly<GameObjectView>): GameObjectView {
  return {
    ...view,
    counters: new Map(view.counters),
    attachments: [...view.attachments],
    abilities: [...view.abilities]
  };
}

function getLayerOrderIndex(layer: Layer): number {
  const index = LAYER_ORDER.indexOf(layer);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortEffectsByTimestamp(effects: ReadonlyArray<ContinuousEffect>): ContinuousEffect[] {
  return effects
    .map((effect, index) => ({ effect, index }))
    .sort((left, right) => {
      if (left.effect.timestamp !== right.effect.timestamp) {
        return left.effect.timestamp - right.effect.timestamp;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.effect);
}

function resolveDependencyOrder(effects: ReadonlyArray<ContinuousEffect>): ContinuousEffect[] {
  const byId = new Map<string, ContinuousEffect>();
  for (const effect of effects) {
    byId.set(effect.id, effect);
  }

  const sortedByTimestamp = sortEffectsByTimestamp(effects);
  const ordered: ContinuousEffect[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (effect: ContinuousEffect): void => {
    if (permanent.has(effect.id)) {
      return;
    }
    if (temporary.has(effect.id)) {
      return;
    }

    temporary.add(effect.id);

    for (const dependency of effect.dependsOn ?? []) {
      const dependencyEffect = byId.get(dependency.effectId);
      if (dependencyEffect !== undefined) {
        visit(dependencyEffect);
      }
    }

    temporary.delete(effect.id);
    permanent.add(effect.id);
    ordered.push(effect);
  };

  for (const effect of sortedByTimestamp) {
    visit(effect);
  }

  return ordered;
}

function parseAbilities(value: unknown): AbilityAst[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value as AbilityAst[];
}

function applyPayload(
  view: Readonly<GameObjectView>,
  payload: Readonly<ContinuousEffectPayload>
): GameObjectView {
  const source = payload.payload;

  if (source === undefined) {
    return cloneObjectView(view);
  }

  if (payload.kind === "set_controller") {
    const playerId = source.playerId;
    return typeof playerId === "string"
      ? { ...cloneObjectView(view), controller: playerId }
      : cloneObjectView(view);
  }

  if (payload.kind === "set_tapped") {
    const tapped = source.tapped;
    return typeof tapped === "boolean"
      ? { ...cloneObjectView(view), tapped }
      : cloneObjectView(view);
  }

  if (payload.kind === "set_card_def_id") {
    const cardDefId = source.cardDefId;
    return typeof cardDefId === "string"
      ? { ...cloneObjectView(view), cardDefId }
      : cloneObjectView(view);
  }

  if (payload.kind === "set_abilities") {
    const abilities = parseAbilities(source.abilities);
    return abilities === null
      ? cloneObjectView(view)
      : { ...cloneObjectView(view), abilities: [...abilities] };
  }

  return cloneObjectView(view);
}

export function computeGameObject(objectId: string, state: Readonly<GameState>): GameObjectView {
  const base = state.objectPool.get(objectId);
  if (base === undefined) {
    throw new Error(`Cannot compute missing object '${objectId}'`);
  }

  let view = cloneObjectView(base);
  const applicable = state.continuousEffects.filter((effect) =>
    matchesEffectTarget(effect.appliesTo, view, state)
  );

  const effectsByLayer = new Map<Layer, ContinuousEffect[]>();
  for (const effect of applicable) {
    const current = effectsByLayer.get(effect.layer) ?? [];
    effectsByLayer.set(effect.layer, [...current, effect]);
  }

  const sortedLayers = [...effectsByLayer.keys()].sort(
    (left, right) => getLayerOrderIndex(left) - getLayerOrderIndex(right)
  );

  for (const layer of sortedLayers) {
    const inLayer = effectsByLayer.get(layer) ?? [];
    const orderedInLayer = resolveDependencyOrder(inLayer);
    for (const effect of orderedInLayer) {
      view = applyPayload(view, effect.effect);
    }
  }

  return view;
}

export function matchesEffectTarget(
  target: Readonly<EffectTarget>,
  view: Readonly<GameObjectView>,
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
