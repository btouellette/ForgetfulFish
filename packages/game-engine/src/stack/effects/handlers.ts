import { cardRegistry } from "../../cards";
import type { BasicLandType } from "../../cards/abilityAst";
import type {
  AddContinuousEffectAction,
  CounterAction,
  DrawAction,
  MoveZoneAction,
  SetControlAction,
  ShuffleAction,
  ActionId,
  ActionType,
  GameActionBase
} from "../../actions/action";
import type {
  AddTextChangeEffectToTargetSpec,
  AddContinuousEffectToTargetSpec,
  ChooseModeSpec,
  ChooseCardsSpec,
  CounterTargetSpellSpec,
  DrawCardsSpec,
  MillCardsSpec,
  MoveOrderedCardsSpec,
  NameCardSpec,
  OrderCardsSpec,
  ResolveCount,
  ResolveEffectKind,
  ResolveEffectSpec,
  ResolvePlayerSelector,
  ResolveTargetObjectSelector,
  ResolveZoneSelector,
  SetControlOfTargetSpec,
  ShuffleZoneSpec,
  UntapTargetSpec
} from "../../cards/resolveEffect";
import { evaluateResolveValue } from "./values";
import { getComputedObjectView } from "../../effects/continuous/access";
import { LAYERS } from "../../effects/continuous/layers";
import {
  BASIC_LAND_TYPE_VALUES,
  isTextChangePayload,
  listLandTypeInstancesInAbilities,
  listLandTypesInAbilities
} from "../../effects/continuous/textChange";
import { zoneKey } from "../../state/zones";
import { requestChoice } from "./choices";
import type { ResolveEffectHandlerContext, ResolveEffectResult } from "./types";

function baseActionFields(
  context: ResolveEffectHandlerContext
): Omit<GameActionBase, "id" | "type"> {
  return {
    source: context.stackItem.effectContext.source,
    controller: context.stackItem.controller,
    appliedReplacements: []
  };
}

function actionId(
  context: ResolveEffectHandlerContext,
  type: ActionType,
  suffix: string
): ActionId {
  return `${context.stackItem.id}:${type}:${suffix}`;
}

function enqueueDrawAction(
  context: ResolveEffectHandlerContext,
  playerId: string,
  count: number,
  suffix: string
): void {
  const drawAction: DrawAction = {
    ...baseActionFields(context),
    id: actionId(context, "DRAW", suffix),
    type: "DRAW",
    playerId,
    count
  };
  context.enqueueAction(drawAction);
}

function enqueueMoveZoneAction(
  context: ResolveEffectHandlerContext,
  objectId: string,
  from: MoveZoneAction["from"],
  to: MoveZoneAction["to"],
  suffix: string,
  toIndex?: number
): void {
  const moveAction: MoveZoneAction = {
    ...baseActionFields(context),
    id: actionId(context, "MOVE_ZONE", suffix),
    type: "MOVE_ZONE",
    objectId,
    from,
    to,
    ...(toIndex === undefined ? {} : { toIndex })
  };
  context.enqueueAction(moveAction);
}

function resolvePlayerId(
  context: ResolveEffectHandlerContext,
  player: ResolvePlayerSelector
): string {
  if (player === "controller") {
    return context.stackItem.controller;
  }

  const playerTarget = context.stackItem.targets.find((target) => target.kind === "player");
  return playerTarget?.playerId ?? context.stackItem.controller;
}

function resolveZone(
  context: ResolveEffectHandlerContext,
  zone: ResolveZoneSelector,
  playerId: string
) {
  return context.state.mode.resolveZone(context.state, zone, playerId);
}

function readStoredStringArray(
  context: ResolveEffectHandlerContext,
  key: string,
  message: string
): string[] {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  if (!Array.isArray(stored) || !stored.every((value) => typeof value === "string")) {
    throw new Error(message);
  }

  return [...stored];
}

function readOptionalStoredString(
  context: ResolveEffectHandlerContext,
  key: string
): string | null {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  return typeof stored === "string" ? stored : null;
}

function isBasicLandType(value: string): value is BasicLandType {
  return BASIC_LAND_TYPE_VALUES.includes(value as BasicLandType);
}

function resolveModes(spec: ChooseModeSpec, context: ResolveEffectHandlerContext) {
  switch (spec.modeSource.kind) {
    case "explicit":
      return spec.modeSource.modes;
    case "target_land_types": {
      const target = resolveTargetObject(context, spec.modeSource.target);
      if (target === undefined) {
        return [];
      }

      return listLandTypesInAbilities(
        getComputedObjectView(context.state, target.object.id)?.abilities ?? []
      ).map((landType) => ({ id: landType, label: landType }));
    }
    case "target_land_type_instances": {
      const target = resolveTargetObject(context, spec.modeSource.target);
      if (target === undefined) {
        return [];
      }

      return listLandTypeInstancesInAbilities(
        getComputedObjectView(context.state, target.object.id)?.abilities ?? []
      ).map((instance) => ({ id: instance.id, label: instance.label }));
    }
    case "basic_land_types": {
      const excludedValue =
        spec.modeSource.excludeStoreKey === undefined
          ? null
          : readOptionalStoredString(context, spec.modeSource.excludeStoreKey);

      if (spec.modeSource.excludeStoreKey !== undefined && excludedValue === null) {
        return [];
      }

      return BASIC_LAND_TYPE_VALUES.filter((landType) => landType !== excludedValue).map(
        (landType) => ({
          id: landType,
          label: landType
        })
      );
    }
  }
}

function resolveTargetObject(
  context: ResolveEffectHandlerContext,
  target: ResolveTargetObjectSelector
) {
  if (target !== "first_object_target") {
    throw new Error(`unsupported target selector '${target}'`);
  }

  return context.stackItem.targets.find((candidate) => candidate.kind === "object");
}

function resolveCount(count: ResolveCount, context: ResolveEffectHandlerContext): number {
  if (typeof count === "number") {
    return count;
  }

  return evaluateResolveValue(count, {
    scratch: context.stackItem.effectContext.whiteboard.scratch,
    zones: context.mutable.nextZones,
    objectPool: context.mutable.nextObjectPool,
    resolveZone: (zone, playerId) => resolveZone(context, zone, playerId),
    controller: context.stackItem.controller,
    sourceCardDefId: context.cardDefinition.id
  });
}

function resolveDrawCards(
  spec: DrawCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const count = resolveCount(spec.count, context);

  enqueueDrawAction(context, resolvePlayerId(context, spec.player), count, `${spec.kind}-${count}`);

  return { kind: "continue" };
}

function resolveChooseCards(
  spec: ChooseCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const { stackItem, mutable } = context;
  const zone = resolveZone(context, spec.zone, stackItem.controller);
  const zoneCards = mutable.nextZones.get(zoneKey(zone)) ?? [];
  const candidates =
    spec.zone === "library" && spec.typeFilter !== undefined
      ? zoneCards.filter((cardId) => {
          const libraryObject = mutable.nextObjectPool.get(cardId);
          if (libraryObject === undefined) {
            return false;
          }

          const definition = cardRegistry.get(libraryObject.cardDefId);
          return definition?.typeLine.some((type) => spec.typeFilter?.includes(type)) ?? false;
        })
      : spec.zone === "hand"
        ? [
            ...zoneCards,
            ...mutable.nextActions
              .filter(
                (action): action is DrawAction =>
                  action.type === "DRAW" && action.playerId === stackItem.controller
              )
              .flatMap((action) => {
                const libraryZone = resolveZone(context, "library", stackItem.controller);
                const libraryCards = mutable.nextZones.get(zoneKey(libraryZone)) ?? [];
                return libraryCards.slice(0, action.count);
              })
          ]
        : zoneCards;

  if (candidates.length < spec.min) {
    throw new Error(
      `resolveChooseCards: not enough candidate cards for ${spec.storeKey} (needed at least ${spec.min}, found ${candidates.length})`
    );
  }

  if (candidates.length === 0) {
    context.writeScratch({ [spec.storeKey]: [] });
    return { kind: "continue" };
  }

  const outcome = requestChoice(context, {
    type: "CHOOSE_CARDS",
    storeKey: spec.storeKey,
    prompt: spec.prompt,
    constraints: { candidates, min: spec.min, max: spec.max },
    idSuffix: "choose-cards"
  });
  if (outcome.kind === "paused") {
    return outcome.result;
  }

  context.writeScratch({ [spec.storeKey]: [...outcome.payload.selected] });

  return { kind: "continue" };
}

function resolveOrderCards(
  spec: OrderCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const selectedCards = readStoredStringArray(
    context,
    spec.sourceKey,
    `missing ordered-card source '${spec.sourceKey}' in scratch state`
  );
  const outcome = requestChoice(context, {
    type: "ORDER_CARDS",
    storeKey: spec.storeKey,
    prompt: spec.prompt,
    constraints: { cards: selectedCards },
    idSuffix: "order-cards"
  });
  if (outcome.kind === "paused") {
    return outcome.result;
  }

  context.writeScratch({ [spec.storeKey]: [...outcome.payload.ordered] });

  return { kind: "continue" };
}

function resolveMoveOrderedCards(
  spec: MoveOrderedCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const orderedCards = readStoredStringArray(
    context,
    spec.sourceKey,
    `missing move source '${spec.sourceKey}' in scratch state`
  );
  const playerId = context.stackItem.controller;
  const fromZone = resolveZone(context, spec.fromZone, playerId);
  const toZone = resolveZone(context, spec.toZone, playerId);

  for (let index = 0; index < orderedCards.length; index += 1) {
    enqueueMoveZoneAction(
      context,
      orderedCards[index]!,
      fromZone,
      toZone,
      `${spec.kind}-${index}`,
      spec.placement === "top" ? index : undefined
    );
  }

  return { kind: "continue" };
}

function resolveNameCard(
  spec: NameCardSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const outcome = requestChoice(context, {
    type: "NAME_CARD",
    storeKey: spec.storeKey,
    prompt: spec.prompt,
    constraints: {},
    idSuffix: "name-card"
  });
  if (outcome.kind === "paused") {
    return outcome.result;
  }

  context.writeScratch({ [spec.storeKey]: outcome.payload.cardName });

  return { kind: "continue" };
}

function resolveChooseMode(
  spec: ChooseModeSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const modes = resolveModes(spec, context);
  if (modes.length === 0) {
    return { kind: "continue" };
  }

  const outcome = requestChoice(context, {
    type: "CHOOSE_MODE",
    storeKey: spec.storeKey,
    prompt: spec.prompt,
    constraints: { modes },
    idSuffix: "choose-mode"
  });
  if (outcome.kind === "paused") {
    return outcome.result;
  }

  const payload = outcome.payload;

  if (spec.modeSource.kind === "target_land_type_instances") {
    const target = resolveTargetObject(context, spec.modeSource.target);
    const selectedInstance =
      target === undefined
        ? null
        : listLandTypeInstancesInAbilities(
            getComputedObjectView(context.state, target.object.id)?.abilities ?? []
          ).find((instance) => instance.id === payload.mode.id);

    context.writeScratch({
      [spec.storeKey]: payload.mode.id,
      ...(spec.selectedLandTypeStoreKey === undefined || selectedInstance == null
        ? {}
        : { [spec.selectedLandTypeStoreKey]: selectedInstance.landType })
    });

    return { kind: "continue" };
  }

  context.writeScratch({ [spec.storeKey]: payload.mode.id });

  return { kind: "continue" };
}

function resolveMillCards(
  spec: MillCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const playerId = resolvePlayerId(context, spec.player);
  const libraryZone = resolveZone(context, "library", playerId);
  const graveyardZone = resolveZone(context, "graveyard", playerId);
  const currentLibrary = context.mutable.nextZones.get(zoneKey(libraryZone)) ?? [];
  const milledCards = currentLibrary.slice(0, spec.count);

  for (let index = 0; index < milledCards.length; index += 1) {
    enqueueMoveZoneAction(
      context,
      milledCards[index]!,
      libraryZone,
      graveyardZone,
      `${spec.kind}-${index}`
    );
  }

  context.writeScratch({ [spec.storeKey]: milledCards });
  return { kind: "continue" };
}

function resolveCounterTargetSpell(
  spec: CounterTargetSpellSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const objectTarget = resolveTargetObject(context, "first_object_target");
  if (objectTarget === undefined) {
    return { kind: "continue" };
  }

  const targetObject = context.mutable.nextObjectPool.get(objectTarget.object.id);
  if (targetObject === undefined || targetObject.zcc !== objectTarget.object.zcc) {
    return { kind: "continue" };
  }

  const destinationZone =
    spec.destination === "library-top"
      ? context.state.mode.resolveZone(context.state, "library", targetObject.owner)
      : context.state.mode.resolveZone(context.state, "graveyard", targetObject.owner);
  const counterAction: CounterAction = {
    ...baseActionFields(context),
    id: actionId(context, "COUNTER", `counter-${objectTarget.object.id}`),
    type: "COUNTER",
    object: objectTarget.object,
    destination: destinationZone,
    ...(spec.destination === "library-top" ? { toIndex: 0 } : {})
  };
  context.enqueueAction(counterAction);

  return { kind: "continue" };
}

function resolveSetControlOfTarget(
  spec: SetControlOfTargetSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = resolveTargetObject(context, spec.target);
  if (target === undefined) {
    return { kind: "continue" };
  }

  const setControlAction: SetControlAction = {
    ...baseActionFields(context),
    id: actionId(context, "SET_CONTROL", spec.kind),
    type: "SET_CONTROL",
    objectId: target.object.id,
    to: context.stackItem.controller,
    duration: spec.duration
  };
  context.enqueueAction(setControlAction);

  return { kind: "continue" };
}

function resolveUntapTarget(
  spec: UntapTargetSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = resolveTargetObject(context, spec.target);
  if (target === undefined) {
    return { kind: "continue" };
  }

  context.enqueueAction({
    ...baseActionFields(context),
    id: actionId(context, "UNTAP", spec.kind),
    type: "UNTAP",
    objectId: target.object.id
  });

  return { kind: "continue" };
}

function resolveAddContinuousEffectToTarget(
  spec: AddContinuousEffectToTargetSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = resolveTargetObject(context, spec.target);
  if (target === undefined) {
    return { kind: "continue" };
  }

  const effectSuffix =
    spec.effect.kind === "grant_keyword"
      ? spec.effect.payload.keyword === "landwalk"
        ? `${spec.kind}:${spec.effect.payload.keyword}:${spec.effect.payload.landType}`
        : `${spec.kind}:${spec.effect.payload.keyword}`
      : `${spec.kind}:${spec.effect.kind}`;

  const effectAction: AddContinuousEffectAction = {
    ...baseActionFields(context),
    id: actionId(context, "ADD_CONTINUOUS_EFFECT", effectSuffix),
    type: "ADD_CONTINUOUS_EFFECT",
    effect: {
      id: actionId(context, "ADD_CONTINUOUS_EFFECT", effectSuffix),
      source: context.stackItem.effectContext.source,
      layer: spec.layer,
      duration: spec.duration,
      appliesTo: { kind: "object", object: target.object },
      effect: spec.effect
    }
  };
  context.enqueueAction(effectAction);

  return { kind: "continue" };
}

function resolveAddTextChangeEffectToTarget(
  spec: AddTextChangeEffectToTargetSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = resolveTargetObject(context, spec.target);
  if (target === undefined) {
    return { kind: "continue" };
  }

  const fromLandType = readOptionalStoredString(context, spec.fromKey);
  const toLandType = readOptionalStoredString(context, spec.toKey);
  if (fromLandType === null || toLandType === null) {
    return { kind: "continue" };
  }

  if (!isBasicLandType(fromLandType) || !isBasicLandType(toLandType)) {
    throw new Error("text change mode selection must be a basic land type");
  }

  const instanceId =
    spec.instanceKey === undefined ? null : readOptionalStoredString(context, spec.instanceKey);
  const payload = {
    fromLandType,
    toLandType,
    ...(instanceId === null ? {} : { instanceId })
  };
  if (!isTextChangePayload(payload)) {
    throw new Error("invalid text change payload");
  }

  const effectSuffix = `${spec.kind}:${fromLandType}->${toLandType}:${instanceId ?? "all"}`;
  const effectAction: AddContinuousEffectAction = {
    ...baseActionFields(context),
    id: actionId(context, "ADD_CONTINUOUS_EFFECT", effectSuffix),
    type: "ADD_CONTINUOUS_EFFECT",
    effect: {
      id: actionId(context, "ADD_CONTINUOUS_EFFECT", effectSuffix),
      source: context.stackItem.effectContext.source,
      layer: LAYERS.TEXT,
      duration: spec.duration,
      appliesTo: { kind: "object", object: target.object },
      effect: {
        kind: "text_change",
        payload
      }
    }
  };
  context.enqueueAction(effectAction);

  return { kind: "continue" };
}

function resolveShuffleZone(
  spec: ShuffleZoneSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const zone = resolveZone(context, spec.zone, context.stackItem.controller);
  const stored =
    spec.topCardFromKey === undefined
      ? null
      : (readStoredStringArray(
          context,
          spec.topCardFromKey,
          `missing top-card source '${spec.topCardFromKey}' in scratch state`
        )[0] ?? null);

  const shuffleAction: ShuffleAction = {
    ...baseActionFields(context),
    id: actionId(context, "SHUFFLE", spec.kind),
    type: "SHUFFLE",
    zone,
    ...(stored === null ? {} : { topObjectId: stored })
  };
  context.enqueueAction(shuffleAction);

  return { kind: "continue" };
}

/**
 * What a resolve effect needs from the spell's declared targets. Target legality is checked at cast
 * time, so this is metadata about the effect kind rather than about a particular resolution.
 */
export type EffectTargetRequirement = "none" | "stack_object" | "battlefield_object";

export type ResolveEffectHandler = {
  kind: ResolveEffectKind;
  targets: EffectTargetRequirement;
  execute: (spec: ResolveEffectSpec, context: ResolveEffectHandlerContext) => ResolveEffectResult;
};

function defineHandler<K extends ResolveEffectKind>(
  kind: K,
  targets: EffectTargetRequirement,
  execute: (
    spec: Extract<ResolveEffectSpec, { kind: K }>,
    context: ResolveEffectHandlerContext
  ) => ResolveEffectResult
): ResolveEffectHandler {
  return {
    kind,
    targets,
    execute: (spec, context) => {
      if (spec.kind !== kind) {
        throw new Error(`expected resolve effect kind '${kind}', received '${spec.kind}'`);
      }

      // Narrowing a union by a generic literal discriminant is not inferred by the compiler; the
      // guard above establishes it.
      return execute(spec as Extract<ResolveEffectSpec, { kind: K }>, context);
    }
  };
}

export const resolveEffectHandlers: Record<ResolveEffectKind, ResolveEffectHandler> = {
  draw_cards: defineHandler("draw_cards", "none", resolveDrawCards),
  choose_cards: defineHandler("choose_cards", "none", resolveChooseCards),
  order_cards: defineHandler("order_cards", "none", resolveOrderCards),
  move_ordered_cards: defineHandler("move_ordered_cards", "none", resolveMoveOrderedCards),
  name_card: defineHandler("name_card", "none", resolveNameCard),
  choose_mode: defineHandler("choose_mode", "none", resolveChooseMode),
  mill_cards: defineHandler("mill_cards", "none", resolveMillCards),
  counter_target_spell: defineHandler(
    "counter_target_spell",
    "stack_object",
    resolveCounterTargetSpell
  ),
  set_control_of_target: defineHandler(
    "set_control_of_target",
    "battlefield_object",
    resolveSetControlOfTarget
  ),
  untap_target: defineHandler("untap_target", "battlefield_object", resolveUntapTarget),
  add_continuous_effect_to_target: defineHandler(
    "add_continuous_effect_to_target",
    "battlefield_object",
    resolveAddContinuousEffectToTarget
  ),
  add_text_change_effect_to_target: defineHandler(
    "add_text_change_effect_to_target",
    "battlefield_object",
    resolveAddTextChangeEffectToTarget
  ),
  shuffle_zone: defineHandler("shuffle_zone", "none", resolveShuffleZone)
};

export const RESOLVE_EFFECT_KINDS = Object.keys(resolveEffectHandlers) as ResolveEffectKind[];

export function targetRequirementFor(kind: ResolveEffectKind): EffectTargetRequirement {
  return resolveEffectHandlers[kind].targets;
}

export function resolveOnResolveEffect(
  spec: ResolveEffectSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  return resolveEffectHandlers[spec.kind].execute(spec, context);
}
