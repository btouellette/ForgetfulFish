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
  AddContinuousEffectSpec,
  ChooseModeSpec,
  ChooseCardsSpec,
  CounterTargetSpellSpec,
  DrawCardsSpec,
  EachPlayerDrawsSpec,
  MillCardsSpec,
  MoveCardsSpec,
  NameCardSpec,
  OrderCardsSpec,
  PhaseOutTargetSpec,
  ResolveCardsSelector,
  ResolveContinuousEffectTemplate,
  ResolveLeafSpec,
  ResolveZoneSelector,
  SetControlOfTargetSpec,
  ShuffleZoneSpec,
  UntapTargetSpec
} from "../../cards/resolveEffect";
import type { ChoicePayload } from "../../commands/command";
import { getComputedObjectView } from "../../effects/continuous/access";
import { LAYERS, type ContinuousEffectPayload } from "../../effects/continuous/layers";
import {
  BASIC_LAND_TYPE_VALUES,
  isTextChangePayload,
  listLandTypeInstancesInAbilities,
  listLandTypesInAbilities
} from "../../effects/continuous/textChange";
import type { GameState } from "../../state/gameState";
import type { ObjectRef, PlayerId } from "../../state/objectRef";
import { zoneKey, type ZoneRef } from "../../state/zones";
import { pauseWithChoiceAndScratch, requireChoicePayload, requireUniqueIds } from "./primitives";
import {
  evaluateAmount,
  readOptionalStoredString,
  readStoredStringArray,
  resolveCards,
  resolveObjectRefs,
  resolvePlayerId,
  resolveTargetObject,
  resolveZoneRef
} from "./selectors";
import { stepPathKey, type ResolveEffectHandlerContext, type ResolveEffectResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isChooseCardsPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "CHOOSE_CARDS" }> {
  return isRecord(payload) && payload.type === "CHOOSE_CARDS" && isStringArray(payload.selected);
}

function isOrderCardsPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "ORDER_CARDS" }> {
  return isRecord(payload) && payload.type === "ORDER_CARDS" && isStringArray(payload.ordered);
}

function isNameCardPayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "NAME_CARD" }> {
  return isRecord(payload) && payload.type === "NAME_CARD" && typeof payload.cardName === "string";
}

export function isChooseModePayload(
  payload: unknown
): payload is Extract<ChoicePayload, { type: "CHOOSE_MODE" }> {
  return (
    isRecord(payload) &&
    payload.type === "CHOOSE_MODE" &&
    isRecord(payload.mode) &&
    typeof payload.mode.id === "string"
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
  return `${context.stackItem.id}:${type}:${stepPathKey(context.path)}:${suffix}`;
}

function enqueueDrawAction(
  context: ResolveEffectHandlerContext,
  playerId: PlayerId,
  count: number,
  suffix: string
): void {
  if (count <= 0) {
    return;
  }

  const drawAction: DrawAction = {
    ...baseActionFields(context),
    id: actionId(context, "DRAW", suffix),
    type: "DRAW",
    playerId,
    count
  };
  context.enqueueAction(drawAction);
}

function isBasicLandType(value: string): value is BasicLandType {
  return BASIC_LAND_TYPE_VALUES.some((landType) => landType === value);
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

/**
 * Choice steps run twice: first they pause with a pending choice, then after
 * the player answers they run again and read the payload from scratch.
 */
function pendingChoiceFor(
  context: ResolveEffectHandlerContext,
  kind: ResolveLeafSpec["kind"]
): { choiceIdKey: string; choiceId: string; answered: boolean } {
  const pathKey = stepPathKey(context.path);
  const choiceIdKey = `choiceId:${pathKey}`;
  return {
    choiceIdKey,
    choiceId: `${context.stackItem.id}:${pathKey}:${kind}`,
    answered: typeof context.stackItem.effectContext.whiteboard.scratch[choiceIdKey] === "string"
  };
}

function pauseForChoice(
  context: ResolveEffectHandlerContext,
  choiceIdKey: string,
  choice: NonNullable<GameState["pendingChoice"]>
): ResolveEffectResult {
  return pauseWithChoiceAndScratch(context, choice, { [choiceIdKey]: choice.id });
}

function resolveChooseCards(
  spec: ChooseCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const candidates = resolveCards(context, spec.from);
  if (candidates.length < spec.min) {
    throw new Error(
      `resolveChooseCards: not enough candidate cards for ${spec.storeKey} (needed at least ${spec.min}, found ${candidates.length})`
    );
  }

  if (candidates.length === 0) {
    context.writeScratch({ [spec.storeKey]: [] });
    return { kind: "continue" };
  }

  const pending = pendingChoiceFor(context, spec.kind);
  if (!pending.answered) {
    return pauseForChoice(context, pending.choiceIdKey, {
      id: pending.choiceId,
      type: "CHOOSE_CARDS",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: { candidates, min: spec.min, max: spec.max }
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    pending.choiceIdKey,
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
  const cards = resolveCards(context, spec.cards);
  const pending = pendingChoiceFor(context, spec.kind);
  if (!pending.answered) {
    return pauseForChoice(context, pending.choiceIdKey, {
      id: pending.choiceId,
      type: "ORDER_CARDS",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: { cards }
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    pending.choiceIdKey,
    isOrderCardsPayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );
  requireUniqueIds(payload.ordered, `${spec.kind} payload must contain unique cards`);
  context.writeScratch({ [spec.storeKey]: [...payload.ordered] });

  return { kind: "continue" };
}

function resolveNameCard(
  spec: NameCardSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const pending = pendingChoiceFor(context, spec.kind);
  if (!pending.answered) {
    return pauseForChoice(context, pending.choiceIdKey, {
      id: pending.choiceId,
      type: "NAME_CARD",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: {}
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    pending.choiceIdKey,
    isNameCardPayload,
    `missing ${spec.kind} choice id in scratch state for '${spec.storeKey}'`,
    `missing ${spec.kind} payload in scratch state for '${spec.storeKey}'`
  );
  context.writeScratch({ [spec.storeKey]: payload.cardName });

  return { kind: "continue" };
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

function resolveChooseMode(
  spec: ChooseModeSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const modes = resolveModes(spec, context);
  if (modes.length === 0) {
    return { kind: "continue" };
  }

  const pending = pendingChoiceFor(context, spec.kind);
  if (!pending.answered) {
    return pauseForChoice(context, pending.choiceIdKey, {
      id: pending.choiceId,
      type: "CHOOSE_MODE",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: { modes }
    });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    pending.choiceIdKey,
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

// ---------------------------------------------------------------------------
// Card movement and drawing
// ---------------------------------------------------------------------------

function resolveDrawCards(
  spec: DrawCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  enqueueDrawAction(
    context,
    resolvePlayerId(context, spec.player),
    evaluateAmount(context, spec.count),
    spec.kind
  );

  return { kind: "continue" };
}

function resolveEachPlayerDraws(
  spec: EachPlayerDrawsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const players = context.state.players;
  const remaining = new Map<PlayerId, number>(
    players.map((player) => [
      player.id,
      evaluateAmount(
        { ...context, bindings: { ...context.bindings, iteratedPlayer: player.id } },
        spec.count
      )
    ])
  );
  const totalDraws = [...remaining.values()].reduce((total, count) => total + count, 0);
  const drawOrder = context.state.mode.simultaneousDrawOrder(
    totalDraws,
    context.state.turnState.activePlayerId,
    [players[0].id, players[1].id]
  );

  let drawIndex = 0;
  for (const preferredPlayerId of drawOrder) {
    const playerId =
      (remaining.get(preferredPlayerId) ?? 0) > 0
        ? preferredPlayerId
        : players.find((player) => (remaining.get(player.id) ?? 0) > 0)?.id;
    if (playerId === undefined) {
      break;
    }

    remaining.set(playerId, (remaining.get(playerId) ?? 0) - 1);
    enqueueDrawAction(context, playerId, 1, `${spec.kind}-${drawIndex}`);
    drawIndex += 1;
  }

  return { kind: "continue" };
}

/** Hidden and private zones belong to a card's owner; the battlefield is shared per controller. */
function destinationZoneFor(
  context: ResolveEffectHandlerContext,
  objectId: string,
  to: ResolveZoneSelector
): ZoneRef | undefined {
  const object = context.mutable.nextObjectPool.get(objectId);
  if (object === undefined) {
    return undefined;
  }

  return resolveZoneRef(context, to, to === "battlefield" ? object.controller : object.owner);
}

function enqueueMoveCards(
  context: ResolveEffectHandlerContext,
  cards: ResolveCardsSelector,
  to: ResolveZoneSelector,
  placement: MoveCardsSpec["placement"],
  suffix: string
): string[] {
  const objectIds = resolveCards(context, cards);
  const moved: string[] = [];

  for (const objectId of objectIds) {
    const object = context.mutable.nextObjectPool.get(objectId);
    const destination = destinationZoneFor(context, objectId, to);
    if (object === undefined || destination === undefined) {
      continue;
    }

    if (zoneKey(object.zone) === zoneKey(destination) && placement === undefined) {
      continue;
    }

    const moveAction: MoveZoneAction = {
      ...baseActionFields(context),
      id: actionId(context, "MOVE_ZONE", `${suffix}-${moved.length}`),
      type: "MOVE_ZONE",
      objectId,
      from: object.zone,
      to: destination,
      ...(placement === "top" ? { toIndex: moved.length } : {})
    };
    context.enqueueAction(moveAction);
    moved.push(objectId);
  }

  return moved;
}

function resolveMoveCards(
  spec: MoveCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const moved = enqueueMoveCards(context, spec.cards, spec.to, spec.placement, spec.kind);
  if (spec.storeKey !== undefined) {
    context.writeScratch({ [spec.storeKey]: moved });
  }

  return { kind: "continue" };
}

function resolveMillCards(
  spec: MillCardsSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const milled = enqueueMoveCards(
    context,
    { kind: "top_of_library", player: spec.player, count: spec.count },
    "graveyard",
    undefined,
    spec.kind
  );
  if (spec.storeKey !== undefined) {
    context.writeScratch({ [spec.storeKey]: milled });
  }

  return { kind: "continue" };
}

function resolveShuffleZone(
  spec: ShuffleZoneSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const zone = resolveZoneRef(context, spec.zone, resolvePlayerId(context, spec.player));
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

// ---------------------------------------------------------------------------
// Targets and permanents
// ---------------------------------------------------------------------------

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
      ? resolveZoneRef(context, "library", targetObject.owner)
      : resolveZoneRef(context, "graveyard", targetObject.owner);
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

function resolvePhaseOutTarget(
  spec: PhaseOutTargetSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = resolveTargetObject(context, spec.target);
  if (target === undefined) {
    return { kind: "continue" };
  }

  context.enqueueAction({
    ...baseActionFields(context),
    id: actionId(context, "PHASE_OUT", spec.kind),
    type: "PHASE_OUT",
    objectId: target.object.id
  });

  return { kind: "continue" };
}

function materializeEffectTemplate(
  context: ResolveEffectHandlerContext,
  template: ResolveContinuousEffectTemplate
): { payload: ContinuousEffectPayload; suffix: string } | null {
  switch (template.kind) {
    case "become_basic_land_type": {
      const landType = readOptionalStoredString(context, template.landTypeKey);
      if (landType === null) {
        return null;
      }

      if (!isBasicLandType(landType)) {
        throw new Error(`stored land type '${landType}' is not a basic land type`);
      }

      return {
        payload: {
          kind: "type_change",
          payload: {
            typeLine: ["Land"],
            subtypes: [{ kind: "basic_land_type", value: landType }]
          }
        },
        suffix: `${template.kind}:${landType}`
      };
    }
    case "grant_keyword":
      return {
        payload: template,
        suffix:
          template.payload.keyword === "landwalk"
            ? `${template.payload.keyword}:${template.payload.landType}`
            : template.payload.keyword
      };
    default:
      return { payload: template, suffix: template.kind };
  }
}

function enqueueContinuousEffect(
  context: ResolveEffectHandlerContext,
  object: ObjectRef,
  spec: Pick<AddContinuousEffectSpec, "layer" | "duration">,
  payload: ContinuousEffectPayload,
  suffix: string
): void {
  const effectId = actionId(context, "ADD_CONTINUOUS_EFFECT", `${suffix}:${object.id}`);
  const effectAction: AddContinuousEffectAction = {
    ...baseActionFields(context),
    id: effectId,
    type: "ADD_CONTINUOUS_EFFECT",
    effect: {
      id: effectId,
      source: context.stackItem.effectContext.source,
      layer: spec.layer,
      duration: spec.duration,
      appliesTo: { kind: "object", object },
      effect: payload
    }
  };
  context.enqueueAction(effectAction);
}

function resolveAddContinuousEffect(
  spec: AddContinuousEffectSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const materialized = materializeEffectTemplate(context, spec.effect);
  if (materialized === null) {
    return { kind: "continue" };
  }

  for (const object of resolveObjectRefs(context, spec.to)) {
    enqueueContinuousEffect(
      context,
      object,
      spec,
      materialized.payload,
      `${spec.kind}:${materialized.suffix}`
    );
  }

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

  enqueueContinuousEffect(
    context,
    target.object,
    { layer: LAYERS.TEXT, duration: spec.duration },
    { kind: "text_change", payload },
    `${spec.kind}:${fromLandType}->${toLandType}:${instanceId ?? "all"}`
  );

  return { kind: "continue" };
}

export function resolveLeafEffect(
  spec: ResolveLeafSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  switch (spec.kind) {
    case "choose_cards":
      return resolveChooseCards(spec, context);
    case "order_cards":
      return resolveOrderCards(spec, context);
    case "name_card":
      return resolveNameCard(spec, context);
    case "choose_mode":
      return resolveChooseMode(spec, context);
    case "draw_cards":
      return resolveDrawCards(spec, context);
    case "each_player_draws":
      return resolveEachPlayerDraws(spec, context);
    case "move_cards":
      return resolveMoveCards(spec, context);
    case "mill_cards":
      return resolveMillCards(spec, context);
    case "shuffle_zone":
      return resolveShuffleZone(spec, context);
    case "counter_target_spell":
      return resolveCounterTargetSpell(spec, context);
    case "set_control_of_target":
      return resolveSetControlOfTarget(spec, context);
    case "untap_target":
      return resolveUntapTarget(spec, context);
    case "phase_out_target":
      return resolvePhaseOutTarget(spec, context);
    case "add_continuous_effect":
      return resolveAddContinuousEffect(spec, context);
    case "add_text_change_effect_to_target":
      return resolveAddTextChangeEffectToTarget(spec, context);
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}
