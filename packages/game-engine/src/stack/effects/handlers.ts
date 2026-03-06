import { cardRegistry } from "../../cards";
import type { ResolveEffectId } from "../../cards/resolveEffect";
import type { ChoicePayload } from "../../commands/command";
import type { GameState } from "../../state/gameState";
import { captureSnapshot, lkiKey } from "../../state/lki";
import { bumpZcc, zoneKey } from "../../state/zones";
import {
  drawCards,
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

function resolveBrainstorm(context: ResolveEffectHandlerContext): ResolveEffectResult {
  const stepHandlers: StepHandler[] = [
    {
      matches: (stepIndex) => stepIndex === 0,
      execute: (stepContext) => {
        const { stackItem, state, mutable } = stepContext;
        drawCards(stepContext.drawOneCard, stackItem.controller, 3);

        const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
        const handCards = mutable.nextZones.get(zoneKey(handZone)) ?? [];
        const chooseChoiceId = `${stackItem.id}:brainstorm:choose-cards`;
        const choice: NonNullable<GameState["pendingChoice"]> = {
          id: chooseChoiceId,
          type: "CHOOSE_CARDS",
          forPlayer: stackItem.controller,
          prompt: "Choose 2 cards to put back on top of your library",
          constraints: {
            candidates: [...handCards],
            min: 2,
            max: 2
          }
        };

        return pauseWithChoiceAndScratch(stepContext, choice, {
          brainstormChooseChoiceId: chooseChoiceId,
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
          "brainstormChooseChoiceId",
          isChooseCardsPayload,
          "missing Brainstorm CHOOSE_CARDS choice id in scratch state",
          "missing Brainstorm CHOOSE_CARDS payload in scratch state"
        );

        const selectedCards = [...payload.selected];
        requireUniqueIds(
          selectedCards,
          "Brainstorm CHOOSE_CARDS payload must contain unique cards"
        );

        const orderChoiceId = `${stackItem.id}:brainstorm:order-cards`;
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
          brainstormOrderChoiceId: orderChoiceId,
          [`resumeStepIndex:${orderChoiceId}`]: 1
        });
      }
    },
    {
      matches: (stepIndex) => stepIndex >= 2,
      execute: (stepContext) => {
        const { stackItem, state, mutable } = stepContext;
        const payload = requireChoicePayload(
          stackItem,
          "brainstormOrderChoiceId",
          isOrderCardsPayload,
          "missing Brainstorm ORDER_CARDS choice id in scratch state",
          "missing Brainstorm ORDER_CARDS payload in scratch state"
        );

        const orderedCards = [...payload.ordered];
        requireUniqueIds(orderedCards, "Brainstorm ORDER_CARDS payload must contain unique cards");

        const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
        const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
        const handKey = zoneKey(handZone);
        const libraryKey = zoneKey(libraryZone);
        const currentHand = mutable.nextZones.get(handKey) ?? [];
        const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
        const currentHandSet = new Set(currentHand);

        for (const cardId of orderedCards) {
          if (!currentHandSet.has(cardId)) {
            throw new Error(`Brainstorm ordered card '${cardId}' is not in hand`);
          }
        }

        const putBackSet = new Set(orderedCards);
        mutable.nextZones.set(
          handKey,
          currentHand.filter((cardId) => !putBackSet.has(cardId))
        );
        mutable.nextZones.set(libraryKey, [...orderedCards, ...currentLibrary]);

        for (const cardId of orderedCards) {
          const handObject = mutable.nextObjectPool.get(cardId);
          if (handObject === undefined) {
            throw new Error(`Cannot move missing object '${cardId}' while resolving Brainstorm`);
          }

          mutable.nextObjectPool.set(
            cardId,
            bumpZcc({
              ...handObject,
              zone: libraryZone,
              controller: stackItem.controller
            })
          );
        }

        mutable.nextPlayers =
          mutable.nextPlayers[0].id === stackItem.controller
            ? [
                {
                  ...mutable.nextPlayers[0],
                  hand: mutable.nextPlayers[0].hand.filter((cardId) => !putBackSet.has(cardId))
                },
                mutable.nextPlayers[1]
              ]
            : [
                mutable.nextPlayers[0],
                {
                  ...mutable.nextPlayers[1],
                  hand: mutable.nextPlayers[1].hand.filter((cardId) => !putBackSet.has(cardId))
                }
              ];

        return { kind: "continue" };
      }
    }
  ];

  return runStepHandlers(context, stepHandlers);
}

function resolveMysticalTutor(context: ResolveEffectHandlerContext): ResolveEffectResult {
  const { stackItem, state, mutable, rng, emit } = context;
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

        return definition.typeLine.includes("Instant") || definition.typeLine.includes("Sorcery");
      });

      const chooseChoiceId = `${stackItem.id}:mystical-tutor:choose-card`;
      const choice: NonNullable<GameState["pendingChoice"]> = {
        id: chooseChoiceId,
        type: "CHOOSE_CARDS",
        forPlayer: stackItem.controller,
        prompt: "Choose up to one instant or sorcery card",
        constraints: {
          candidates,
          min: 0,
          max: 1
        }
      };

      return pauseWithChoiceAndScratch(context, choice, {
        mysticalTutorChoiceId: chooseChoiceId,
        [`resumeStepIndex:${chooseChoiceId}`]: 0
      });
    }
  }

  let selectedCardId: string | null = null;
  if (stepIndex >= 1) {
    const payload = requireChoicePayload(
      stackItem,
      "mysticalTutorChoiceId",
      isChooseCardsPayload,
      "missing Mystical Tutor CHOOSE_CARDS choice id in scratch state",
      "missing Mystical Tutor CHOOSE_CARDS payload in scratch state"
    );
    const selected = [...payload.selected];
    requireUniqueIds(selected, "Mystical Tutor CHOOSE_CARDS payload must contain unique cards");
    if (selected.length > 1) {
      throw new Error("Mystical Tutor can only select up to one card");
    }

    selectedCardId = selected[0] ?? null;
  }

  const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
  if (selectedCardId !== null && !currentLibrary.includes(selectedCardId)) {
    throw new Error(`Mystical Tutor selected card '${selectedCardId}' is not in library`);
  }

  const shuffledLibrary = rng.shuffle(currentLibrary);
  const finalLibrary =
    selectedCardId === null
      ? shuffledLibrary
      : [selectedCardId, ...shuffledLibrary.filter((cardId) => cardId !== selectedCardId)];
  mutable.nextZones.set(libraryKey, finalLibrary);
  emit({
    type: "SHUFFLED",
    zone: libraryZone,
    resultOrder: finalLibrary
  });

  return { kind: "continue" };
}

function resolvePredict(context: ResolveEffectHandlerContext): ResolveEffectResult {
  const stepHandlers: StepHandler[] = [
    {
      matches: (stepIndex) => stepIndex === 0,
      execute: (stepContext) => {
        const { stackItem } = stepContext;
        const nameChoiceId = `${stackItem.id}:predict:name-card`;
        const choice: NonNullable<GameState["pendingChoice"]> = {
          id: nameChoiceId,
          type: "NAME_CARD",
          forPlayer: stackItem.controller,
          prompt: "Name a card",
          constraints: {}
        };

        return pauseWithChoiceAndScratch(stepContext, choice, {
          predictNameChoiceId: nameChoiceId,
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
          "predictNameChoiceId",
          isNameCardPayload,
          "missing Predict NAME_CARD choice id in scratch state",
          "missing Predict NAME_CARD payload in scratch state"
        );

        const namedCardLower = payload.cardName.trim().toLowerCase();

        const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
        const graveyardZone = state.mode.resolveZone(state, "graveyard", stackItem.controller);
        const libraryKey = zoneKey(libraryZone);
        const graveyardKey = zoneKey(graveyardZone);

        const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
        const milledCards = currentLibrary.slice(0, 2);
        const remainingLibrary = currentLibrary.slice(milledCards.length);
        const currentGraveyard = mutable.nextZones.get(graveyardKey) ?? [];

        mutable.nextZones.set(libraryKey, remainingLibrary);
        mutable.nextZones.set(graveyardKey, [...currentGraveyard, ...milledCards]);

        for (const milledCardId of milledCards) {
          const milledObject = mutable.nextObjectPool.get(milledCardId);
          if (milledObject === undefined) {
            throw new Error(`Cannot mill missing object '${milledCardId}' while resolving Predict`);
          }

          mutable.nextLkiStore.set(
            lkiKey(milledObject.id, milledObject.zcc),
            captureSnapshot(milledObject, milledObject, libraryZone)
          );
          mutable.nextObjectPool.set(
            milledCardId,
            bumpZcc({
              ...milledObject,
              zone: graveyardZone
            })
          );
        }

        const namedCardWasMilled = milledCards.some((milledCardId) => {
          const milledObject = mutable.nextObjectPool.get(milledCardId);
          if (milledObject === undefined) {
            return false;
          }

          const milledDefinition = cardRegistry.get(milledObject.cardDefId);
          return milledDefinition?.name.toLowerCase() === namedCardLower;
        });

        if (namedCardWasMilled) {
          drawCards(stepContext.drawOneCard, stackItem.controller, 2);
        }

        return { kind: "continue" };
      }
    }
  ];

  return runStepHandlers(context, stepHandlers);
}

function resolveCounterMoveZone(context: ResolveEffectHandlerContext): ResolveEffectResult {
  const { stackItem, state, mutable, emit, effects } = context;
  if (!effects.has("MOVE_ZONE")) {
    return { kind: "continue" };
  }

  const objectTarget = stackItem.targets.find((target) => target.kind === "object");
  if (objectTarget !== undefined) {
    const targetObject = mutable.nextObjectPool.get(objectTarget.object.id);
    if (targetObject !== undefined && targetObject.zcc === objectTarget.object.zcc) {
      mutable.nextStack = mutable.nextStack.filter(
        (item) => item.object.id !== objectTarget.object.id
      );
      mutable.nextStackZone = mutable.nextStackZone.filter((id) => id !== objectTarget.object.id);

      const stackZone = state.mode.resolveZone(state, "stack", stackItem.controller);
      mutable.nextZones.set(zoneKey(stackZone), mutable.nextStackZone);

      const libraryZone = state.mode.resolveZone(state, "library", targetObject.owner);
      const libraryKey = zoneKey(libraryZone);
      const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
      mutable.nextZones.set(libraryKey, [targetObject.id, ...currentLibrary]);

      const movedTarget = bumpZcc({
        ...targetObject,
        zone: libraryZone
      });
      mutable.nextObjectPool.set(movedTarget.id, movedTarget);
      emit({
        type: "SPELL_COUNTERED",
        object: { id: movedTarget.id, zcc: movedTarget.zcc }
      });
    }
  }

  return { kind: "continue" };
}

function resolveAccumulatedKnowledge(context: ResolveEffectHandlerContext): ResolveEffectResult {
  const { stackItem, state, mutable, drawOneCard, cardDefinition } = context;
  const graveyardZone = state.mode.resolveZone(state, "graveyard", stackItem.controller);
  const graveyardCards = mutable.nextZones.get(zoneKey(graveyardZone)) ?? [];
  const resolvingCardName = cardDefinition.name;
  const accumulatedKnowledgeCount = graveyardCards.reduce((count, objectId) => {
    const graveyardObject = mutable.nextObjectPool.get(objectId);
    if (graveyardObject === undefined) {
      return count;
    }

    const graveyardDefinition = cardRegistry.get(graveyardObject.cardDefId);
    return graveyardDefinition?.name === resolvingCardName ? count + 1 : count;
  }, 0);

  drawCards(drawOneCard, stackItem.controller, accumulatedKnowledgeCount + 1);

  return { kind: "continue" };
}

const handlers: Record<
  ResolveEffectId,
  (context: ResolveEffectHandlerContext) => ResolveEffectResult
> = {
  BRAINSTORM: resolveBrainstorm,
  MYSTICAL_TUTOR: resolveMysticalTutor,
  PREDICT: resolvePredict,
  COUNTER: resolveCounterMoveZone,
  MOVE_ZONE: () => ({ kind: "continue" }),
  DRAW_ACCUMULATED_KNOWLEDGE: resolveAccumulatedKnowledge
};

export function resolveOnResolveEffect(
  effectId: ResolveEffectId,
  context: ResolveEffectHandlerContext
): ResolveEffectResult {
  return handlers[effectId](context);
}
