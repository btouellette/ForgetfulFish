import { cardRegistry } from "../../cards";
import type {
  BasicLandType,
  ConditionAst,
  Color,
  Duration,
  KeywordAbilityAst,
  SubtypeAtom
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

const COUNTER_ADJUSTMENT_EFFECT_ID_PREFIX = "__counter_adjustment__";
const LAST_SYNTHETIC_COUNTER_TIMESTAMP = Number.MAX_SAFE_INTEGER;

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

function isTextLayerEffect(effect: Readonly<ContinuousEffect>): boolean {
  return effect.layer === LAYERS.TEXT && effect.effect.kind === "text_change";
}

function inferTextDependenciesForObject(
  objectId: string,
  state: Readonly<GameState>,
  baseView: Readonly<DerivedGameObjectView>
): ContinuousEffect[] {
  void objectId; // parameter intentionally unused in this helper — keep signature for future use
  const textEffects = state.continuousEffects.filter(
    (effect) =>
      isTextLayerEffect(effect) &&
      isTextChangePayload(effect.effect.payload) &&
      matchesEffectTarget(effect.appliesTo, baseView, state) &&
      conditionAppliesToView(effect.condition, baseView, state)
  );

  if (textEffects.length < 2) {
    return state.continuousEffects;
  }

  const baseAbilities = baseView.abilities;
  const inferredDependencies = new Map<string, Set<string>>();
  const abilitiesAfterEffect = new Map<string, DerivedGameObjectView["abilities"]>();

  for (const effect of textEffects) {
    inferredDependencies.set(
      effect.id,
      new Set((effect.dependsOn ?? []).map((dependency) => dependency.effectId))
    );

    const effectPayload = effect.effect.payload;
    if (isTextChangePayload(effectPayload)) {
      abilitiesAfterEffect.set(effect.id, applyTextChangeToAbilities(baseAbilities, effectPayload));
    }
  }

  for (const effect of textEffects) {
    const effectPayload = effect.effect.payload;
    if (!isTextChangePayload(effectPayload)) {
      continue;
    }

    const abilitiesWithoutDependency = abilitiesAfterEffect.get(effect.id);
    if (abilitiesWithoutDependency === undefined) {
      continue;
    }

    const appliesWithoutDependency = abilitiesWithoutDependency !== baseAbilities;

    for (const candidateDependency of textEffects) {
      if (candidateDependency.id === effect.id) {
        continue;
      }

      const dependencyPayload = candidateDependency.effect.payload;
      if (!isTextChangePayload(dependencyPayload)) {
        continue;
      }

      const afterDependency = abilitiesAfterEffect.get(candidateDependency.id);
      if (afterDependency === undefined) {
        continue;
      }

      const appliesAfterDependency =
        applyTextChangeToAbilities(afterDependency, effectPayload) !== afterDependency;

      if (!appliesWithoutDependency && appliesAfterDependency) {
        const set = inferredDependencies.get(effect.id);
        if (set !== undefined) {
          set.add(candidateDependency.id);
        }
      }
    }
  }

  return state.continuousEffects.map((effect) => {
    const dependencies = inferredDependencies.get(effect.id);
    if (dependencies === undefined) {
      return effect;
    }

    return {
      ...effect,
      dependsOn: [...dependencies].map((effectId) => ({ effectId }))
    };
  });
}

function applyEffectToView(
  view: Readonly<DerivedGameObjectView>,
  effect: Readonly<ContinuousEffect>
): DerivedGameObjectView {
  if (effect.layer === LAYERS.TYPE && effect.effect.kind === "type_change") {
    const typeLine = effect.effect.payload?.typeLine;
    const subtypes = effect.effect.payload?.subtypes;
    const nextTypeLine = isTypeLine(typeLine) ? [...typeLine] : view.typeLine;
    const nextSubtypes = isSubtypeAtomArray(subtypes) ? [...subtypes] : view.subtypes;
    if (nextTypeLine !== view.typeLine || nextSubtypes !== view.subtypes) {
      return {
        ...view,
        typeLine: nextTypeLine,
        subtypes: nextSubtypes
      };
    }
  }

  if (effect.layer === LAYERS.COLOR && effect.effect.kind === "set_color") {
    const color = effect.effect.payload?.color;
    if (isColorArray(color)) {
      return {
        ...view,
        color: [...color]
      };
    }
  }

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

  if (effect.layer === LAYERS.PT_ADJUST && effect.effect.kind === "adjust_pt") {
    const powerDelta = effect.effect.payload?.powerDelta;
    const toughnessDelta = effect.effect.payload?.toughnessDelta;
    if (
      typeof powerDelta === "number" &&
      typeof toughnessDelta === "number" &&
      view.power !== null &&
      view.toughness !== null
    ) {
      return {
        ...view,
        power: view.power + powerDelta,
        toughness: view.toughness + toughnessDelta
      };
    }
  }

  if (effect.layer === LAYERS.PT_ADJUST && isSyntheticCounterAdjustmentEffect(effect)) {
    return applyCounterAdjustments(view);
  }

  if (effect.layer === LAYERS.PT_SWITCH && effect.effect.kind === "switch_pt") {
    if (view.power !== null && view.toughness !== null) {
      return {
        ...view,
        power: view.toughness,
        toughness: view.power
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
    if (effect.effect.kind === "remove_all_abilities") {
      return {
        ...view,
        abilities: []
      };
    }

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

function isColor(value: unknown): value is Color {
  return (
    value === "white" ||
    value === "blue" ||
    value === "black" ||
    value === "red" ||
    value === "green"
  );
}

function isColorArray(value: unknown): value is Color[] {
  return Array.isArray(value) && value.every((entry) => isColor(entry));
}

function isTypeLine(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSubtypeAtom(value: unknown): value is SubtypeAtom {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.value !== "string") {
    return false;
  }

  switch (record.kind) {
    case "basic_land_type":
      return isBasicLandType(record.value);
    case "creature_type":
    case "other":
      return true;
    default:
      return false;
  }
}

function isSubtypeAtomArray(value: unknown): value is SubtypeAtom[] {
  return Array.isArray(value) && value.every((entry) => isSubtypeAtom(entry));
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
    return view;
  }

  const plusOneCounters = view.counters.get("+1/+1") ?? 0;
  const minusOneCounters = view.counters.get("-1/-1") ?? 0;
  const netAdjustment = plusOneCounters - minusOneCounters;

  if (netAdjustment === 0) {
    return view;
  }

  return {
    ...view,
    power: view.power + netAdjustment,
    toughness: view.toughness + netAdjustment
  };
}

function createCounterAdjustmentEffect(
  objectId: string,
  state: Readonly<GameState>
): ContinuousEffect | null {
  const object = state.objectPool.get(objectId);
  if (object === undefined) {
    return null;
  }

  const plusOneCounters = object.counters.get("+1/+1") ?? 0;
  const minusOneCounters = object.counters.get("-1/-1") ?? 0;
  const netAdjustment = plusOneCounters - minusOneCounters;
  if (netAdjustment === 0) {
    return null;
  }

  return {
    id: `${COUNTER_ADJUSTMENT_EFFECT_ID_PREFIX}${object.id}:${object.zcc}`,
    source: { id: object.id, zcc: object.zcc },
    layer: LAYERS.PT_ADJUST,
    sublayer: LAYERS.PT_ADJUST,
    timestamp: LAST_SYNTHETIC_COUNTER_TIMESTAMP,
    duration: "permanent",
    appliesTo: { kind: "object", object: { id: object.id, zcc: object.zcc } },
    effect: { kind: "apply_counters" }
  };
}

function isSyntheticCounterAdjustmentEffect(effect: Readonly<ContinuousEffect>): boolean {
  return (
    effect.id.startsWith(COUNTER_ADJUSTMENT_EFFECT_ID_PREFIX) &&
    effect.layer === LAYERS.PT_ADJUST &&
    effect.sublayer === LAYERS.PT_ADJUST &&
    effect.timestamp === LAST_SYNTHETIC_COUNTER_TIMESTAMP &&
    effect.effect.kind === "apply_counters"
  );
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
    color: [...(definition?.color ?? [])],
    typeLine: [...(definition?.typeLine ?? [])],
    subtypes: [...(definition?.subtypes ?? [])],
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
  const syntheticCounterEffect = createCounterAdjustmentEffect(objectId, state);
  // Fast path: if there are no continuous effects and no synthetic counter effect, return
  // the base derived view immediately without allocating clones or doing sorting.
  if (state.continuousEffects.length === 0 && syntheticCounterEffect === null) {
    const base = requireBaseObject(objectId, state);
    const finalView =
      base.summoningSick && hasKeywordAbility(base, "haste")
        ? { ...base, summoningSick: false }
        : base;

    return {
      view: finalView,
      appliedEffects: []
    };
  }

  const baseView = requireBaseObject(objectId, state);
  const effectsWithInferredTextDependencies = inferTextDependenciesForObject(
    objectId,
    state,
    baseView
  );
  const sortedEffects = orderEffectsForApplication(
    syntheticCounterEffect === null
      ? effectsWithInferredTextDependencies
      : [...effectsWithInferredTextDependencies, syntheticCounterEffect]
  );
  const appliedEffects: ContinuousEffect[] = [];

  let view = baseView;
  for (const effect of sortedEffects) {
    if (!matchesEffectTarget(effect.appliesTo, view, state)) {
      continue;
    }

    if (!conditionAppliesToView(effect.condition, view, state)) {
      continue;
    }

    if (!isSyntheticCounterAdjustmentEffect(effect)) {
      appliedEffects.push(effect);
    }
    view = applyEffectToView(view, effect);
  }

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
  if (effect.effect.kind === "apply_counters") {
    throw new Error("continuous effect kind 'apply_counters' is reserved for engine-internal use");
  }

  if (effect.id.startsWith(COUNTER_ADJUSTMENT_EFFECT_ID_PREFIX)) {
    throw new Error(`continuous effect id '${effect.id}' is reserved for engine-internal use`);
  }

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
