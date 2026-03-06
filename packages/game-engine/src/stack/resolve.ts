import { cardRegistry } from "../cards";
import type { ChoicePayload } from "../commands/command";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
import { captureSnapshot, lkiKey } from "../state/lki";
import { bumpZcc, zoneKey } from "../state/zones";

export type ResolveStackResult = {
  state: GameState;
  events: GameEvent[];
  pendingChoice: GameState["pendingChoice"];
};

function isPermanentCard(typeLine: string[]): boolean {
  return typeLine.some((type) =>
    ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].includes(type)
  );
}

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

export function resolveTopOfStack(state: Readonly<GameState>, rng: Rng): ResolveStackResult {
  if (state.stack.length === 0) {
    return { state: { ...state }, events: [], pendingChoice: state.pendingChoice ?? null };
  }

  const stackItem = state.stack[state.stack.length - 1];
  if (stackItem === undefined) {
    return { state: { ...state }, events: [], pendingChoice: state.pendingChoice ?? null };
  }

  const object = state.objectPool.get(stackItem.object.id);
  if (object === undefined) {
    throw new Error(`Cannot resolve missing stack object '${stackItem.object.id}'`);
  }

  const cardDefinition = cardRegistry.get(object.cardDefId);
  if (cardDefinition === undefined) {
    throw new Error(`Cannot resolve unknown card definition '${object.cardDefId}'`);
  }

  const validatedTargets = partitionResolvedTargets(state, stackItem.targets);
  const allTargetsIllegal =
    stackItem.targets.length > 0 &&
    validatedTargets.legalTargets.length === 0 &&
    validatedTargets.illegalTargets.length > 0;

  const stackZone = state.mode.resolveZone(state, "stack", stackItem.controller);
  const destinationZone = allTargetsIllegal
    ? state.mode.resolveZone(state, "graveyard", object.owner)
    : isPermanentCard(cardDefinition.typeLine)
      ? state.mode.resolveZone(state, "battlefield", stackItem.controller)
      : state.mode.resolveZone(state, "graveyard", object.owner);

  const stackKey = zoneKey(stackZone);
  const currentStackZone = state.zones.get(stackKey) ?? [];

  let nextStack = state.stack.slice(0, -1);
  let nextStackZone = currentStackZone.filter((id) => id !== stackItem.object.id);

  let nextVersion = state.version;
  const resolutionEvents: GameEvent[] = [];

  const emit = (payload: GameEventPayload): void => {
    nextVersion += 1;
    resolutionEvents.push(
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        nextVersion,
        payload
      )
    );
  };

  const nextZones = new Map(state.zones);
  nextZones.set(stackKey, nextStackZone);
  const nextObjectPool = new Map(state.objectPool);
  const nextLkiStore = new Map(state.lkiStore);
  let nextPlayers: GameState["players"] = [
    {
      ...state.players[0],
      hand: [...state.players[0].hand]
    },
    {
      ...state.players[1],
      hand: [...state.players[1].hand]
    }
  ];
  let pendingChoice: GameState["pendingChoice"] = null;

  const markAttemptedDrawFromEmptyLibrary = (playerId: string): void => {
    nextPlayers =
      nextPlayers[0].id === playerId
        ? [
            {
              ...nextPlayers[0],
              attemptedDrawFromEmptyLibrary: true
            },
            nextPlayers[1]
          ]
        : [
            nextPlayers[0],
            {
              ...nextPlayers[1],
              attemptedDrawFromEmptyLibrary: true
            }
          ];
    nextVersion += 1;
  };

  const drawOneCard = (playerId: string): void => {
    const libraryZone = state.mode.resolveZone(state, "library", playerId);
    const handZone = state.mode.resolveZone(state, "hand", playerId);
    const libraryKey = zoneKey(libraryZone);
    const handKey = zoneKey(handZone);

    const currentLibrary = nextZones.get(libraryKey) ?? [];
    const drawnCardId = currentLibrary[0];
    if (drawnCardId === undefined) {
      markAttemptedDrawFromEmptyLibrary(playerId);
      return;
    }

    nextZones.set(libraryKey, currentLibrary.slice(1));
    nextZones.set(handKey, [...(nextZones.get(handKey) ?? []), drawnCardId]);

    const drawnObject = nextObjectPool.get(drawnCardId);
    if (drawnObject === undefined) {
      throw new Error(`Cannot draw missing object '${drawnCardId}' during resolution`);
    }

    const nextOwner = state.mode.determineOwner(playerId, "draw");
    const movedDrawnObject = bumpZcc({
      ...drawnObject,
      owner: nextOwner,
      controller: playerId,
      zone: handZone
    });
    nextObjectPool.set(movedDrawnObject.id, movedDrawnObject);
    nextLkiStore.set(
      lkiKey(drawnObject.id, drawnObject.zcc),
      captureSnapshot(drawnObject, drawnObject, libraryZone)
    );

    nextPlayers =
      nextPlayers[0].id === playerId
        ? [
            {
              ...nextPlayers[0],
              hand: [...nextPlayers[0].hand, drawnCardId]
            },
            nextPlayers[1]
          ]
        : [
            nextPlayers[0],
            {
              ...nextPlayers[1],
              hand: [...nextPlayers[1].hand, drawnCardId]
            }
          ];

    emit({
      type: "CARD_DRAWN",
      playerId,
      cardId: drawnCardId
    });
  };

  const pauseWithChoice = (
    choice: NonNullable<GameState["pendingChoice"]>,
    updatedTopItem: GameState["stack"][number]
  ): ResolveStackResult => {
    const pausedStack = state.stack.slice();
    pausedStack[pausedStack.length - 1] = updatedTopItem;
    nextZones.set(stackKey, [...currentStackZone]);
    nextVersion += 1;

    const nextState: GameState = {
      ...state,
      version: nextVersion,
      players: nextPlayers,
      stack: pausedStack,
      zones: nextZones,
      objectPool: nextObjectPool,
      lkiStore: nextLkiStore,
      pendingChoice: choice
    };

    return {
      state: nextState,
      events: resolutionEvents,
      pendingChoice: choice
    };
  };

  if (!allTargetsIllegal && cardDefinition.onResolve.includes("BRAINSTORM")) {
    const cursor = stackItem.effectContext.cursor;
    const stepIndex = cursor.kind === "start" ? 0 : cursor.kind === "step" ? cursor.index : -1;

    if (stepIndex === 0) {
      for (let drawIndex = 0; drawIndex < 3; drawIndex += 1) {
        drawOneCard(stackItem.controller);
      }

      const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
      const handCards = nextZones.get(zoneKey(handZone)) ?? [];
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

      const updatedTopItem = {
        ...stackItem,
        effectContext: {
          ...stackItem.effectContext,
          cursor: { kind: "waiting_choice", choiceId: chooseChoiceId } as const,
          whiteboard: {
            ...stackItem.effectContext.whiteboard,
            scratch: {
              ...stackItem.effectContext.whiteboard.scratch,
              brainstormChooseChoiceId: chooseChoiceId,
              [`resumeStepIndex:${chooseChoiceId}`]: 0
            }
          }
        }
      };

      return pauseWithChoice(choice, updatedTopItem);
    }

    if (stepIndex === 1) {
      const chooseChoiceId = stackItem.effectContext.whiteboard.scratch.brainstormChooseChoiceId;
      if (typeof chooseChoiceId !== "string") {
        throw new Error("missing Brainstorm CHOOSE_CARDS choice id in scratch state");
      }

      const rawPayload = stackItem.effectContext.whiteboard.scratch[`choice:${chooseChoiceId}`];
      if (!isChooseCardsPayload(rawPayload)) {
        throw new Error("missing Brainstorm CHOOSE_CARDS payload in scratch state");
      }

      const selectedCards = [...rawPayload.selected];
      if (new Set(selectedCards).size !== selectedCards.length) {
        throw new Error("Brainstorm CHOOSE_CARDS payload must contain unique cards");
      }
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

      const updatedTopItem = {
        ...stackItem,
        effectContext: {
          ...stackItem.effectContext,
          cursor: { kind: "waiting_choice", choiceId: orderChoiceId } as const,
          whiteboard: {
            ...stackItem.effectContext.whiteboard,
            scratch: {
              ...stackItem.effectContext.whiteboard.scratch,
              brainstormOrderChoiceId: orderChoiceId,
              [`resumeStepIndex:${orderChoiceId}`]: 1
            }
          }
        }
      };

      return pauseWithChoice(choice, updatedTopItem);
    }

    if (stepIndex >= 2) {
      const orderChoiceId = stackItem.effectContext.whiteboard.scratch.brainstormOrderChoiceId;
      if (typeof orderChoiceId !== "string") {
        throw new Error("missing Brainstorm ORDER_CARDS choice id in scratch state");
      }

      const rawPayload = stackItem.effectContext.whiteboard.scratch[`choice:${orderChoiceId}`];
      if (!isOrderCardsPayload(rawPayload)) {
        throw new Error("missing Brainstorm ORDER_CARDS payload in scratch state");
      }

      const orderedCards = [...rawPayload.ordered];
      if (new Set(orderedCards).size !== orderedCards.length) {
        throw new Error("Brainstorm ORDER_CARDS payload must contain unique cards");
      }
      const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
      const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
      const handKey = zoneKey(handZone);
      const libraryKey = zoneKey(libraryZone);
      const currentHand = nextZones.get(handKey) ?? [];
      const currentLibrary = nextZones.get(libraryKey) ?? [];

      for (const cardId of orderedCards) {
        if (!currentHand.includes(cardId)) {
          throw new Error(`Brainstorm ordered card '${cardId}' is not in hand`);
        }
      }

      const putBackSet = new Set(orderedCards);
      nextZones.set(
        handKey,
        currentHand.filter((cardId) => !putBackSet.has(cardId))
      );
      nextZones.set(libraryKey, [...orderedCards, ...currentLibrary]);

      for (const cardId of orderedCards) {
        const handObject = nextObjectPool.get(cardId);
        if (handObject === undefined) {
          throw new Error(`Cannot move missing object '${cardId}' while resolving Brainstorm`);
        }

        nextObjectPool.set(
          cardId,
          bumpZcc({
            ...handObject,
            zone: libraryZone,
            controller: stackItem.controller
          })
        );
      }

      nextPlayers =
        nextPlayers[0].id === stackItem.controller
          ? [
              {
                ...nextPlayers[0],
                hand: nextPlayers[0].hand.filter((cardId) => !putBackSet.has(cardId))
              },
              nextPlayers[1]
            ]
          : [
              nextPlayers[0],
              {
                ...nextPlayers[1],
                hand: nextPlayers[1].hand.filter((cardId) => !putBackSet.has(cardId))
              }
            ];
    }
  }

  if (!allTargetsIllegal && cardDefinition.onResolve.includes("MYSTICAL_TUTOR")) {
    const cursor = stackItem.effectContext.cursor;
    const stepIndex = cursor.kind === "start" ? 0 : cursor.kind === "step" ? cursor.index : -1;
    const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
    const libraryKey = zoneKey(libraryZone);

    if (stepIndex === 0) {
      const currentLibrary = nextZones.get(libraryKey) ?? [];
      if (currentLibrary.length > 0) {
        const candidates = currentLibrary.filter((cardId) => {
          const libraryObject = nextObjectPool.get(cardId);
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

        const updatedTopItem = {
          ...stackItem,
          effectContext: {
            ...stackItem.effectContext,
            cursor: { kind: "waiting_choice", choiceId: chooseChoiceId } as const,
            whiteboard: {
              ...stackItem.effectContext.whiteboard,
              scratch: {
                ...stackItem.effectContext.whiteboard.scratch,
                mysticalTutorChoiceId: chooseChoiceId,
                [`resumeStepIndex:${chooseChoiceId}`]: 0
              }
            }
          }
        };

        return pauseWithChoice(choice, updatedTopItem);
      }
    }

    let selectedCardId: string | null = null;
    if (stepIndex >= 1) {
      const choiceId = stackItem.effectContext.whiteboard.scratch.mysticalTutorChoiceId;
      if (typeof choiceId === "string") {
        const payload = stackItem.effectContext.whiteboard.scratch[`choice:${choiceId}`];
        if (!isChooseCardsPayload(payload)) {
          throw new Error("missing Mystical Tutor CHOOSE_CARDS payload in scratch state");
        }

        if (new Set(payload.selected).size !== payload.selected.length) {
          throw new Error("Mystical Tutor CHOOSE_CARDS payload must contain unique cards");
        }

        if (payload.selected.length > 1) {
          throw new Error("Mystical Tutor can only select up to one card");
        }

        selectedCardId = payload.selected[0] ?? null;
      }
    }

    const currentLibrary = nextZones.get(libraryKey) ?? [];
    if (currentLibrary.length > 0) {
      const shuffledLibrary = rng.shuffle(currentLibrary);
      nextZones.set(libraryKey, shuffledLibrary);
      emit({
        type: "SHUFFLED",
        zone: libraryZone,
        resultOrder: shuffledLibrary
      });

      if (selectedCardId !== null) {
        const selectedObject = nextObjectPool.get(selectedCardId);
        if (selectedObject === undefined) {
          throw new Error(
            `Cannot move missing object '${selectedCardId}' while resolving Mystical Tutor`
          );
        }

        nextZones.set(libraryKey, [
          selectedCardId,
          ...shuffledLibrary.filter((cardId) => cardId !== selectedCardId)
        ]);
        nextObjectPool.set(
          selectedCardId,
          bumpZcc({
            ...selectedObject,
            zone: libraryZone,
            controller: stackItem.controller
          })
        );
      }
    }
  }

  if (
    !allTargetsIllegal &&
    cardDefinition.onResolve.includes("COUNTER") &&
    cardDefinition.onResolve.includes("MOVE_ZONE")
  ) {
    const objectTarget = stackItem.targets.find((target) => target.kind === "object");
    if (objectTarget !== undefined) {
      const targetObject = nextObjectPool.get(objectTarget.object.id);
      if (targetObject !== undefined && targetObject.zcc === objectTarget.object.zcc) {
        nextStack = nextStack.filter((item) => item.object.id !== objectTarget.object.id);
        nextStackZone = nextStackZone.filter((id) => id !== objectTarget.object.id);
        nextZones.set(stackKey, nextStackZone);

        const libraryZone = state.mode.resolveZone(state, "library", targetObject.owner);
        const libraryKey = zoneKey(libraryZone);
        const currentLibrary = nextZones.get(libraryKey) ?? [];
        nextZones.set(libraryKey, [targetObject.id, ...currentLibrary]);

        const movedTarget = bumpZcc({
          ...targetObject,
          zone: libraryZone
        });
        nextObjectPool.set(movedTarget.id, movedTarget);
        emit({
          type: "SPELL_COUNTERED",
          object: { id: movedTarget.id, zcc: movedTarget.zcc }
        });
      }
    }
  }

  if (!allTargetsIllegal && cardDefinition.onResolve.includes("DRAW_ACCUMULATED_KNOWLEDGE")) {
    const graveyardZone = state.mode.resolveZone(state, "graveyard", stackItem.controller);
    const graveyardCards = nextZones.get(zoneKey(graveyardZone)) ?? [];
    const accumulatedKnowledgeCount = graveyardCards.reduce((count, objectId) => {
      const graveyardObject = nextObjectPool.get(objectId);
      return graveyardObject?.cardDefId === "accumulated-knowledge" ? count + 1 : count;
    }, 0);

    const cardsToDraw = accumulatedKnowledgeCount + 1;
    for (let drawIndex = 0; drawIndex < cardsToDraw; drawIndex += 1) {
      drawOneCard(stackItem.controller);
    }
  }

  const movedObject = bumpZcc({
    ...object,
    zone: destinationZone
  });
  nextObjectPool.set(movedObject.id, movedObject);

  const destinationKey = zoneKey(destinationZone);
  const currentDestination = nextZones.get(destinationKey) ?? [];
  const nextDestination = [...currentDestination, stackItem.object.id];
  nextZones.set(destinationKey, nextDestination);

  emit(
    allTargetsIllegal
      ? { type: "SPELL_COUNTERED", object: { id: movedObject.id, zcc: movedObject.zcc } }
      : { type: "SPELL_RESOLVED", object: { id: movedObject.id, zcc: movedObject.zcc } }
  );

  const nextState: GameState = {
    ...state,
    version: nextVersion,
    players: nextPlayers,
    stack: nextStack,
    zones: nextZones,
    objectPool: nextObjectPool,
    lkiStore: nextLkiStore,
    pendingChoice: pendingChoice
  };

  return {
    state: nextState,
    events: resolutionEvents,
    pendingChoice
  };
}
