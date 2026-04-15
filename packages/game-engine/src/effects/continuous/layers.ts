import { cardRegistry } from "../../cards";
import type {
  BasicLandType,
  ConditionAst,
  Duration,
  KeywordAbilityAst
} from "../../cards/abilityAst";
import type { DerivedGameObjectView } from "../../state/gameObject";
import type { GameState } from "../../state/gameState";
import type { ObjectRef } from "../../state/objectRef";
import { zoneKey } from "../../state/zones";
import { applyTextChangeToAbilities, isTextChangePayload } from "./textChange";
import { BASIC_LAND_TYPE_VALUES } from "./textChange";

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
  | { kind: "object"; object: ObjectRef }
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

  return 0;
}

function orderEffectsWithinLayer(
  effects: readonly Readonly<ContinuousEffect>[]
): ContinuousEffect[] {
  const ordered = [...effects].sort(sortEffectsForApplication);
  const byId = new Map(ordered.map((effect) => [effect.id, effect]));
  const remainingIds = new Set(ordered.map((effect) => effect.id));
  const resolvedIds = new Set<string>();
  const result: ContinuousEffect[] = [];

  while (remainingIds.size > 0) {
    let progressed = false;

    for (const effect of ordered) {
      if (!remainingIds.has(effect.id)) {
        continue;
      }

      const unmetDependencies = (effect.dependsOn ?? []).filter((dependency) => {
        if (!remainingIds.has(dependency.effectId)) {
          return false;
        }

        return byId.has(dependency.effectId) && !resolvedIds.has(dependency.effectId);
      });

      if (unmetDependencies.length > 0) {
        continue;
      }

      result.push(effect);
      remainingIds.delete(effect.id);
      resolvedIds.add(effect.id);
      progressed = true;
    }

    if (!progressed) {
      for (const effect of ordered) {
        if (!remainingIds.has(effect.id)) {
          continue;
        }

        result.push(effect);
        remainingIds.delete(effect.id);
        resolvedIds.add(effect.id);
        break;
      }
    }
  }

  return result;
}

function orderEffectsForApplication(
  effects: readonly Readonly<ContinuousEffect>[]
): ContinuousEffect[] {
  const layers = new Map<Layer, ContinuousEffect[]>();
  for (const effect of effects) {
    const existing = layers.get(effect.layer) ?? [];
    existing.push(effect);
    layers.set(effect.layer, existing);
  }

  return [...layers.entries()]
    .sort(([leftLayer], [rightLayer]) => layerSortKey(leftLayer) - layerSortKey(rightLayer))
    .flatMap(([, layerEffects]) => orderEffectsWithinLayer(layerEffects));
}

function applyEffectToView(
  view: Readonly<DerivedGameObjectView>,
  effect: Readonly<ContinuousEffect>
): DerivedGameObjectView {
  if (effect.layer === LAYERS.PT_SET && effect.effect.kind === "set_pt") {
    const power = effect.effect.payload?.power;
    const toughness = effect.effect.payload?.toughness;
    if (typeof power === "number" && typeof toughness === "number") {
      return {
        ...view,
        power,
        toughness
      };
    }
  }

  if (effect.layer === LAYERS.CONTROL && effect.effect.kind === "set_controller") {
    const playerId = effect.effect.payload?.playerId;
    if (typeof playerId === "string") {
      return {
        ...view,
        controller: playerId
      };
    }
  }

  if (effect.layer === LAYERS.ABILITY) {
    const keywordAbility = toGrantedKeywordAbility(effect.effect);
    if (keywordAbility !== null) {
      return {
        ...view,
        abilities: [...view.abilities, keywordAbility]
      };
    }
  }

  if (effect.layer === LAYERS.TEXT && effect.effect.kind === "text_change") {
    if (isTextChangePayload(effect.effect.payload)) {
      return {
        ...view,
        abilities: applyTextChangeToAbilities(view.abilities, effect.effect.payload)
      };
    }
  }

  return view;
}

function toGrantedKeywordAbility(
  payload: Readonly<ContinuousEffectPayload>
): KeywordAbilityAst | null {
  if (payload.kind !== "grant_keyword") {
    return null;
  }

  const keyword = payload.payload?.keyword;
  if (keyword === "flying" || keyword === "first_strike" || keyword === "haste") {
    return { kind: "keyword", keyword };
  }

  if (keyword === "landwalk") {
    const landType = payload.payload?.landType;
    if (isBasicLandType(landType)) {
      return { kind: "keyword", keyword: "landwalk", landType };
    }
  }

  return null;
}

function isBasicLandType(value: unknown): value is BasicLandType {
  return BASIC_LAND_TYPE_VALUES.includes(value as BasicLandType);
}

function hasKeywordAbility(
  view: Readonly<DerivedGameObjectView>,
  keyword: KeywordAbilityAst["keyword"]
): boolean {
  return view.abilities.some(
    (ability) => ability.kind === "keyword" && ability.keyword === keyword
  );
}

function applyCounterAdjustments(view: Readonly<DerivedGameObjectView>): DerivedGameObjectView {
  if (view.power === null || view.toughness === null) {
    return cloneDerivedView(view);
  }

  const plusOneCounters = view.counters.get("+1/+1") ?? 0;
  const minusOneCounters = view.counters.get("-1/-1") ?? 0;
  const netAdjustment = plusOneCounters - minusOneCounters;

  if (netAdjustment === 0) {
    return cloneDerivedView(view);
  }

  return {
    ...cloneDerivedView(view),
    power: view.power + netAdjustment,
    toughness: view.toughness + netAdjustment
  };
}

function findDefendingPlayerId(
  state: Readonly<GameState>,
  attackerPlayerId: string
): string | null {
  const attackerExists = state.players.some((player) => player.id === attackerPlayerId);
  if (!attackerExists) {
    return null;
  }

  const defender = state.players.find((player) => player.id !== attackerPlayerId);
  return defender?.id ?? null;
}

export function conditionAppliesToView(
  condition: ConditionAst | undefined,
  view: Readonly<DerivedGameObjectView>,
  state: Readonly<GameState>
): boolean {
  if (condition === undefined) {
    return true;
  }

  switch (condition.kind) {
    case "defender_controls_land_type": {
      const defenderId = findDefendingPlayerId(state, view.controller);
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
        if (object === undefined || object.controller !== defenderId) {
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
    default:
      throw new Error(`Unhandled condition kind: ${condition.kind satisfies never}`);
  }
}

function requireBaseObject(objectId: string, state: Readonly<GameState>): DerivedGameObjectView {
  const baseObject = state.objectPool.get(objectId);
  if (baseObject === undefined) {
    throw new Error(`object '${objectId}' is missing from state '${state.id}'`);
  }

  const definition = cardRegistry.get(baseObject.cardDefId);
  const definitionKeywords = definition?.keywords ?? [];
  const definitionStaticAbilities = definition?.staticAbilities ?? [];
  const definitionTriggeredAbilities = definition?.triggeredAbilities ?? [];
  const definitionActivatedAbilities = definition?.activatedAbilities ?? [];

  return {
    ...baseObject,
    power: definition?.power ?? null,
    toughness: definition?.toughness ?? null,
    abilities: [
      ...definitionKeywords,
      ...definitionStaticAbilities,
      ...definitionTriggeredAbilities,
      ...definitionActivatedAbilities,
      ...baseObject.abilities
    ]
  };
}

function resolveContinuousEffects(
  objectId: string,
  state: Readonly<GameState>
): {
  view: DerivedGameObjectView;
  appliedEffects: ContinuousEffect[];
} {
  const sortedEffects = orderEffectsForApplication(state.continuousEffects);
  const appliedEffects: ContinuousEffect[] = [];

  let view = cloneDerivedView(requireBaseObject(objectId, state));
  for (const effect of sortedEffects) {
    if (!matchesEffectTarget(effect.appliesTo, view, state)) {
      continue;
    }

    if (!conditionAppliesToView(effect.condition, view, state)) {
      continue;
    }

    appliedEffects.push(effect);
    view = applyEffectToView(view, effect);
  }

  view = applyCounterAdjustments(view);

  if (view.summoningSick && hasKeywordAbility(view, "haste")) {
    view = {
      ...view,
      summoningSick: false
    };
  }

  return {
    view,
    appliedEffects
  };
}

export function computeGameObject(
  objectId: string,
  state: Readonly<GameState>
): DerivedGameObjectView {
  return resolveContinuousEffects(objectId, state).view;
}

export function getApplicableContinuousEffects(
  objectId: string,
  state: Readonly<GameState>
): readonly ContinuousEffect[] {
  return resolveContinuousEffects(objectId, state).appliedEffects;
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
      return view.id === target.object.id && view.zcc === target.object.zcc;
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
