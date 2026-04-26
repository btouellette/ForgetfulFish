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
  DrawByGraveyardSelfCountSpec,
  DrawByNamedHitSpec,
  DrawCardsSpec,
  MillCardsSpec,
  MoveOrderedCardsSpec,
  NameCardSpec,
  OrderCardsSpec,
  ResolveEffectSpec,
  ResolvePlayerSelector,
  ResolveTargetObjectSelector,
  ResolveZoneSelector,
  SetControlOfTargetSpec,
  ShuffleZoneSpec,
  UntapTargetSpec
} from "../../cards/resolveEffect";
import type { ChoicePayload } from "../../commands/command";
import { getComputedObjectView } from "../../effects/continuous/access";
import { LAYERS } from "../../effects/continuous/layers";
import {
  BASIC_LAND_TYPE_VALUES,
  isTextChangePayload,
  listLandTypeInstancesInAbilities,
  listLandTypesInAbilities
} from "../../effects/continuous/textChange";
import type { GameState } from "../../state/gameState";
import { zoneKey } from "../../state/zones";
import { pauseWithChoiceAndScratch, requireChoicePayload, requireUniqueIds } from "./primitives";
import type { ResolveEffectHandlerContext, ResolveEffectResult } from "./types";

function isChooseCardsPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "CHOOSE_CARDS" }> {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    candidate.type === "CHOOSE_CARDS" &&
    Array.isArray(candidate.selected) &&
    candidate.selected.every((value) => typeof value === "string")
  );
}

function isOrderCardsPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "ORDER_CARDS" }> {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    candidate.type === "ORDER_CARDS" &&
    Array.isArray(candidate.ordered) &&
    candidate.ordered.every((value) => typeof value === "string")
  );
}

function isNameCardPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "NAME_CARD" }> {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return candidate.type === "NAME_CARD" && typeof candidate.cardName === "string";
}

function isChooseModePayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "CHOOSE_MODE" }> {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const mode = candidate.mode;
  return (
    candidate.type === "CHOOSE_MODE" &&
    typeof mode === "object" &&
    mode !== null &&
    typeof (mode as Record<string, unknown>).id === "string"
  );
}

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

function readStoredString(
  context: ResolveEffectHandlerContext,
  key: string,
  message: string
): string {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  if (typeof stored !== "string") {
    throw new Error(message);
  }

  return stored;
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

function resolveDrawCards(
  spec: DrawCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  enqueueDrawAction(
    context,
    resolvePlayerId(context, spec.player),
    spec.count,
    `${spec.kind}-${spec.count}`
  );

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

  const choiceIdKey = `${spec.storeKey}:choiceId`;
  if (typeof stackItem.effectContext.whiteboard.scratch[choiceIdKey] !== "string") {
    const choiceId = `${stackItem.id}:${spec.storeKey}:choose-cards`;
    const choice: NonNullable<GameState["pendingChoice"]> = {
      id: choiceId,
      type: "CHOOSE_CARDS",
      forPlayer: stackItem.controller,
      prompt: spec.prompt,
      constraints: {
        candidates,
        min: spec.min,
        max: spec.max
      }
    };

    return pauseWithChoiceAndScratch(context, choice, {
      [choiceIdKey]: choiceId,
      [`resumeStepIndex:${choiceId}`]: 0
    });
  }

  const payload = requireChoicePayload(
    stackItem,
    choiceIdKey,
    isChooseCardsPayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );
  requireUniqueIds(payload.selected, `${spec.kind} payload must contain unique cards`);
  context.writeScratch({ [spec.storeKey]: [...payload.selected] });

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
  const choiceIdKey = `${spec.storeKey}:choiceId`;
  if (typeof context.stackItem.effectContext.whiteboard.scratch[choiceIdKey] !== "string") {
    const choiceId = `${context.stackItem.id}:${spec.storeKey}:order-cards`;
    const choice: NonNullable<GameState["pendingChoice"]> = {
      id: choiceId,
      type: "ORDER_CARDS",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: { cards: selectedCards }
    };

    return pauseWithChoiceAndScratch(context, choice, {
      [choiceIdKey]: choiceId,
      [`resumeStepIndex:${choiceId}`]: 0
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    choiceIdKey,
    isOrderCardsPayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );
  requireUniqueIds(payload.ordered, `${spec.kind} payload must contain unique cards`);
  context.writeScratch({ [spec.storeKey]: [...payload.ordered] });

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
  const choiceIdKey = `${spec.storeKey}:choiceId`;
  if (typeof context.stackItem.effectContext.whiteboard.scratch[choiceIdKey] !== "string") {
    const choiceId = `${context.stackItem.id}:${spec.storeKey}:name-card`;
    const choice: NonNullable<GameState["pendingChoice"]> = {
      id: choiceId,
      type: "NAME_CARD",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: {}
    };

    return pauseWithChoiceAndScratch(context, choice, {
      [choiceIdKey]: choiceId,
      [`resumeStepIndex:${choiceId}`]: 0
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    choiceIdKey,
    isNameCardPayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );
  context.writeScratch({ [spec.storeKey]: payload.cardName });

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

  const choiceIdKey = `${spec.storeKey}:choiceId`;
  if (typeof context.stackItem.effectContext.whiteboard.scratch[choiceIdKey] !== "string") {
    const choiceId = `${context.stackItem.id}:${spec.storeKey}:choose-mode`;
    const choice: NonNullable<GameState["pendingChoice"]> = {
      id: choiceId,
      type: "CHOOSE_MODE",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: { modes }
    };

    return pauseWithChoiceAndScratch(context, choice, {
      [choiceIdKey]: choiceId,
      [`resumeStepIndex:${choiceId}`]: 0
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    choiceIdKey,
    isChooseModePayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );

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

function resolveDrawByNamedHit(
  spec: DrawByNamedHitSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const namedCardLower = readStoredString(
    context,
    spec.namedCardKey,
    `missing named card key '${spec.namedCardKey}' in scratch state`
  )
    .trim()
    .toLowerCase();
  const milledCards = readStoredStringArray(
    context,
    spec.milledCardsKey,
    `missing milled cards key '${spec.milledCardsKey}' in scratch state`
  );

  const namedCardWasMilled = milledCards.some((milledCardId) => {
    const milledObject = context.mutable.nextObjectPool.get(milledCardId);
    if (milledObject === undefined) {
      return false;
    }

    const milledDefinition = cardRegistry.get(milledObject.cardDefId);
    return milledDefinition?.name.toLowerCase() === namedCardLower;
  });

  enqueueDrawAction(
    context,
    context.stackItem.controller,
    namedCardWasMilled ? spec.hitCount : spec.missCount,
    namedCardWasMilled ? `${spec.kind}-hit` : `${spec.kind}-miss`
  );

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

function resolveDrawByGraveyardSelfCount(
  spec: DrawByGraveyardSelfCountSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const graveyardZone = resolveZone(context, "graveyard", context.stackItem.controller);
  const graveyardCards = context.mutable.nextZones.get(zoneKey(graveyardZone)) ?? [];
  const resolvingCardDefId = context.cardDefinition.id;
  const count = graveyardCards.reduce((total, objectId) => {
    const graveyardObject = context.mutable.nextObjectPool.get(objectId);
    return graveyardObject?.cardDefId === resolvingCardDefId ? total + 1 : total;
  }, 0);

  enqueueDrawAction(
    context,
    context.stackItem.controller,
    count + spec.bonus,
    `${spec.kind}-${spec.bonus}`
  );

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

export function resolveOnResolveEffect(
  spec: ResolveEffectSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  switch (spec.kind) {
    case "draw_cards":
      return resolveDrawCards(spec, context);
    case "choose_cards":
      return resolveChooseCards(spec, context);
    case "order_cards":
      return resolveOrderCards(spec, context);
    case "move_ordered_cards":
      return resolveMoveOrderedCards(spec, context);
    case "name_card":
      return resolveNameCard(spec, context);
    case "choose_mode":
      return resolveChooseMode(spec, context);
    case "mill_cards":
      return resolveMillCards(spec, context);
    case "draw_by_named_hit":
      return resolveDrawByNamedHit(spec, context);
    case "counter_target_spell":
      return resolveCounterTargetSpell(spec, context);
    case "draw_by_graveyard_self_count":
      return resolveDrawByGraveyardSelfCount(spec, context);
    case "set_control_of_target":
      return resolveSetControlOfTarget(spec, context);
    case "untap_target":
      return resolveUntapTarget(spec, context);
    case "add_continuous_effect_to_target":
      return resolveAddContinuousEffectToTarget(spec, context);
    case "add_text_change_effect_to_target":
      return resolveAddTextChangeEffectToTarget(spec, context);
    case "shuffle_zone":
      return resolveShuffleZone(spec, context);
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}
