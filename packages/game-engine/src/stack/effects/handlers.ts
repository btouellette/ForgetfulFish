import { cardRegistry } from "../../cards";
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
import { LAYERS } from "../../effects/continuous/layers";
import type {
  CounterSpellSpec,
  DrawByGraveyardCopyCountSpec,
  DrawChooseReturnSpec,
  GainControlUntapMustAttackSpec,
  NameMillDrawOnHitSpec,
  ResolveEffectSpec,
  SearchLibraryShuffleTopSpec
} from "../../cards/resolveEffect";
import type { ChoicePayload } from "../../commands/command";
import type { GameState } from "../../state/gameState";
import { zoneKey } from "../../state/zones";
import {
  getStepIndex,
  pauseWithChoiceAndScratch,
  requireChoicePayload,
  requireUniqueIds,
  runStepHandlers,
  type StepHandler
} from "./primitives";
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

function resolveDrawChooseReturn(
  spec: DrawChooseReturnSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const stepHandlers: StepHandler[] = [
    {
      matches: (stepIndex) => stepIndex === 0,
      execute: (stepContext) => {
        const { stackItem, state, mutable } = stepContext;
        const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
        const handCards = mutable.nextZones.get(zoneKey(handZone)) ?? [];
        const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
        const libraryCards = mutable.nextZones.get(zoneKey(libraryZone)) ?? [];
        const drawnCards = libraryCards.slice(0, spec.drawAmount);
        const candidateCards = [...handCards, ...drawnCards];

        enqueueDrawAction(
          stepContext,
          stackItem.controller,
          spec.drawAmount,
          "draw-choose-return-draw"
        );

        const chooseChoiceId = `${stackItem.id}:draw-choose-return:choose-cards`;
        const choice: NonNullable<GameState["pendingChoice"]> = {
          id: chooseChoiceId,
          type: "CHOOSE_CARDS",
          forPlayer: stackItem.controller,
          prompt: `Choose ${spec.returnAmount} card${spec.returnAmount === 1 ? "" : "s"} to put back on top of your library`,
          constraints: {
            candidates: candidateCards,
            min: spec.returnAmount,
            max: spec.returnAmount
          }
        };

        return pauseWithChoiceAndScratch(stepContext, choice, {
          drawChooseReturnChooseChoiceId: chooseChoiceId,
          [`resumeStepIndex:${chooseChoiceId}`]: 0
        });
      }
    },
    {
      matches: (stepIndex) => stepIndex === 1,
      execute: (stepContext) => {
        const { stackItem } = stepContext;
        const payload = requireChoicePayload(
          stackItem,
          "drawChooseReturnChooseChoiceId",
          isChooseCardsPayload,
          "missing DRAW_CHOOSE_RETURN CHOOSE_CARDS choice id in scratch state",
          "missing DRAW_CHOOSE_RETURN CHOOSE_CARDS payload in scratch state"
        );

        const selectedCards = [...payload.selected];
        requireUniqueIds(
          selectedCards,
          "DRAW_CHOOSE_RETURN CHOOSE_CARDS payload must contain unique cards"
        );

        const orderChoiceId = `${stackItem.id}:draw-choose-return:order-cards`;
        const choice: NonNullable<GameState["pendingChoice"]> = {
          id: orderChoiceId,
          type: "ORDER_CARDS",
          forPlayer: stackItem.controller,
          prompt: "Order the chosen cards to put back on top",
          constraints: {
            cards: selectedCards
          }
        };

        return pauseWithChoiceAndScratch(stepContext, choice, {
          drawChooseReturnOrderChoiceId: orderChoiceId,
          [`resumeStepIndex:${orderChoiceId}`]: 1
        });
      }
    },
    {
      matches: (stepIndex) => stepIndex >= 2,
      execute: (stepContext) => {
        const { stackItem, state } = stepContext;
        const payload = requireChoicePayload(
          stackItem,
          "drawChooseReturnOrderChoiceId",
          isOrderCardsPayload,
          "missing DRAW_CHOOSE_RETURN ORDER_CARDS choice id in scratch state",
          "missing DRAW_CHOOSE_RETURN ORDER_CARDS payload in scratch state"
        );

        const orderedCards = [...payload.ordered];
        requireUniqueIds(
          orderedCards,
          "DRAW_CHOOSE_RETURN ORDER_CARDS payload must contain unique cards"
        );

        const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
        const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);

        for (let index = 0; index < orderedCards.length; index += 1) {
          const cardId = orderedCards[index]!;
          enqueueMoveZoneAction(
            stepContext,
            cardId,
            handZone,
            libraryZone,
            `draw-choose-return-put-back-${index}`,
            index
          );
        }

        return { kind: "continue" };
      }
    }
  ];

  return runStepHandlers(context, stepHandlers);
}

function resolveSearchLibraryShuffleTop(
  spec: SearchLibraryShuffleTopSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  if (spec.max > 1) {
    throw new Error(
      `SEARCH_LIBRARY_SHUFFLE_TOP does not support max > 1 (got ${spec.max}): placing multiple cards on top in order is not implemented`
    );
  }

  const { stackItem, state, mutable } = context;
  const stepIndex = getStepIndex(stackItem);
  const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
  const libraryKey = zoneKey(libraryZone);

  if (stepIndex === 0) {
    const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
    if (currentLibrary.length > 0) {
      const candidates = currentLibrary.filter((cardId) => {
        const libraryObject = mutable.nextObjectPool.get(cardId);
        if (libraryObject === undefined) {
          return false;
        }

        const definition = cardRegistry.get(libraryObject.cardDefId);
        if (definition === undefined) {
          return false;
        }

        return spec.typeFilter.some((type) => definition.typeLine.includes(type));
      });

      const typeLabel = spec.typeFilter.join(" or ");
      const prompt =
        spec.min === 0 ? `Choose up to one ${typeLabel} card` : `Choose a ${typeLabel} card`;

      const chooseChoiceId = `${stackItem.id}:search-library-shuffle-top:choose-card`;
      const choice: NonNullable<GameState["pendingChoice"]> = {
        id: chooseChoiceId,
        type: "CHOOSE_CARDS",
        forPlayer: stackItem.controller,
        prompt,
        constraints: {
          candidates,
          min: spec.min,
          max: spec.max
        }
      };

      return pauseWithChoiceAndScratch(context, choice, {
        searchLibraryChoiceId: chooseChoiceId,
        [`resumeStepIndex:${chooseChoiceId}`]: 0
      });
    }
  }

  let selectedCardId: string | null = null;
  if (stepIndex >= 1) {
    const payload = requireChoicePayload(
      stackItem,
      "searchLibraryChoiceId",
      isChooseCardsPayload,
      `missing SEARCH_LIBRARY_SHUFFLE_TOP CHOOSE_CARDS choice id in scratch state`,
      `missing SEARCH_LIBRARY_SHUFFLE_TOP CHOOSE_CARDS payload in scratch state`
    );
    const selected = [...payload.selected];
    requireUniqueIds(
      selected,
      "SEARCH_LIBRARY_SHUFFLE_TOP CHOOSE_CARDS payload must contain unique cards"
    );
    if (selected.length > spec.max) {
      throw new Error(
        `SEARCH_LIBRARY_SHUFFLE_TOP selected ${selected.length} cards but max is ${spec.max}`
      );
    }

    selectedCardId = selected[0] ?? null;
  }

  const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
  if (selectedCardId !== null && !currentLibrary.includes(selectedCardId)) {
    throw new Error(
      `SEARCH_LIBRARY_SHUFFLE_TOP selected card '${selectedCardId}' is not in library`
    );
  }

  const shuffleAction: ShuffleAction = {
    ...baseActionFields(context),
    id: actionId(context, "SHUFFLE", "search-library"),
    type: "SHUFFLE",
    zone: libraryZone,
    ...(selectedCardId === null ? {} : { topObjectId: selectedCardId })
  };
  context.enqueueAction(shuffleAction);

  return { kind: "continue" };
}

function resolveNameMillDrawOnHit(
  spec: NameMillDrawOnHitSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const stepHandlers: StepHandler[] = [
    {
      matches: (stepIndex) => stepIndex === 0,
      execute: (stepContext) => {
        const { stackItem } = stepContext;
        const nameChoiceId = `${stackItem.id}:name-mill-draw-on-hit:name-card`;
        const choice: NonNullable<GameState["pendingChoice"]> = {
          id: nameChoiceId,
          type: "NAME_CARD",
          forPlayer: stackItem.controller,
          prompt: "Name a card",
          constraints: {}
        };

        return pauseWithChoiceAndScratch(stepContext, choice, {
          nameMillDrawOnHitChoiceId: nameChoiceId,
          [`resumeStepIndex:${nameChoiceId}`]: 0
        });
      }
    },
    {
      matches: (stepIndex) => stepIndex >= 1,
      execute: (stepContext) => {
        const { stackItem, state, mutable } = stepContext;
        const payload = requireChoicePayload(
          stackItem,
          "nameMillDrawOnHitChoiceId",
          isNameCardPayload,
          "missing NAME_MILL_DRAW_ON_HIT NAME_CARD choice id in scratch state",
          "missing NAME_MILL_DRAW_ON_HIT NAME_CARD payload in scratch state"
        );

        const namedCardLower = payload.cardName.trim().toLowerCase();

        const playerTarget = stackItem.targets.find((target) => target.kind === "player");
        const milledPlayerId = playerTarget?.playerId ?? stackItem.controller;
        const libraryZone = state.mode.resolveZone(state, "library", milledPlayerId);
        const graveyardZone = state.mode.resolveZone(state, "graveyard", milledPlayerId);
        const libraryKey = zoneKey(libraryZone);

        const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
        const milledCards = currentLibrary.slice(0, spec.millAmount);
        const namedCardWasMilled = milledCards.some((milledCardId) => {
          const milledObject = mutable.nextObjectPool.get(milledCardId);
          if (milledObject === undefined) {
            return false;
          }

          const milledDefinition = cardRegistry.get(milledObject.cardDefId);
          return milledDefinition?.name.toLowerCase() === namedCardLower;
        });

        for (let index = 0; index < milledCards.length; index += 1) {
          enqueueMoveZoneAction(
            stepContext,
            milledCards[index]!,
            libraryZone,
            graveyardZone,
            `predict-mill-${index}`
          );
        }

        if (namedCardWasMilled) {
          enqueueDrawAction(
            stepContext,
            stackItem.controller,
            spec.drawOnHitAmount,
            "name-mill-draw-on-hit-hit"
          );
        } else {
          enqueueDrawAction(
            stepContext,
            stackItem.controller,
            spec.missDrawAmount,
            "name-mill-draw-on-hit-miss"
          );
        }

        return { kind: "continue" };
      }
    }
  ];

  return runStepHandlers(context, stepHandlers);
}

function resolveCounterSpell(
  spec: CounterSpellSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const { stackItem, state, mutable } = context;

  const objectTarget = stackItem.targets.find((target) => target.kind === "object");
  if (objectTarget === undefined) {
    return { kind: "continue" };
  }

  const targetObject = mutable.nextObjectPool.get(objectTarget.object.id);
  if (targetObject === undefined || targetObject.zcc !== objectTarget.object.zcc) {
    return { kind: "continue" };
  }

  const destinationZone =
    spec.destination === "library-top"
      ? state.mode.resolveZone(state, "library", targetObject.owner)
      : state.mode.resolveZone(state, "graveyard", targetObject.owner);
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

function resolveDrawByGraveyardCopyCount(
  spec: DrawByGraveyardCopyCountSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const { stackItem, state, mutable, cardDefinition } = context;
  const graveyardZone = state.mode.resolveZone(state, "graveyard", stackItem.controller);
  const graveyardCards = mutable.nextZones.get(zoneKey(graveyardZone)) ?? [];
  const resolvingCardDefId = cardDefinition.id;
  const accumulatedKnowledgeCount = graveyardCards.reduce((count, objectId) => {
    const graveyardObject = mutable.nextObjectPool.get(objectId);
    if (graveyardObject === undefined) {
      return count;
    }

    return graveyardObject.cardDefId === resolvingCardDefId ? count + 1 : count;
  }, 0);

  enqueueDrawAction(
    context,
    stackItem.controller,
    accumulatedKnowledgeCount + spec.bonus,
    "graveyard-copy-count"
  );

  return { kind: "continue" };
}

function resolveGainControlUntapMustAttack(
  _spec: GainControlUntapMustAttackSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  const target = context.stackItem.targets.find((candidate) => candidate.kind === "object");
  if (target === undefined) {
    return { kind: "continue" };
  }

  const setControlAction: SetControlAction = {
    ...baseActionFields(context),
    id: actionId(context, "SET_CONTROL", "gain-control"),
    type: "SET_CONTROL",
    objectId: target.object.id,
    to: context.stackItem.controller,
    duration: "until_end_of_turn"
  };
  context.enqueueAction(setControlAction);

  context.enqueueAction({
    ...baseActionFields(context),
    id: actionId(context, "UNTAP", "gain-control"),
    type: "UNTAP",
    objectId: target.object.id
  });

  const mustAttackEffectAction: AddContinuousEffectAction = {
    ...baseActionFields(context),
    id: actionId(context, "ADD_CONTINUOUS_EFFECT", "must-attack"),
    type: "ADD_CONTINUOUS_EFFECT",
    effect: {
      id: actionId(context, "ADD_CONTINUOUS_EFFECT", "must-attack"),
      source: context.stackItem.effectContext.source,
      layer: LAYERS.ABILITY,
      timestamp: context.state.version,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: target.object.id },
      effect: { kind: "must_attack" }
    }
  };
  context.enqueueAction(mustAttackEffectAction);

  return { kind: "continue" };
}

export function resolveOnResolveEffect(
  spec: ResolveEffectSpec,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  switch (spec.id) {
    case "DRAW_CHOOSE_RETURN":
      return resolveDrawChooseReturn(spec, context);
    case "SEARCH_LIBRARY_SHUFFLE_TOP":
      return resolveSearchLibraryShuffleTop(spec, context);
    case "NAME_MILL_DRAW_ON_HIT":
      return resolveNameMillDrawOnHit(spec, context);
    case "COUNTER_SPELL":
      return resolveCounterSpell(spec, context);
    case "DRAW_BY_GRAVEYARD_COPY_COUNT":
      return resolveDrawByGraveyardCopyCount(spec, context);
    case "GAIN_CONTROL_UNTAP_MUST_ATTACK":
      return resolveGainControlUntapMustAttack(spec, context);
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}
