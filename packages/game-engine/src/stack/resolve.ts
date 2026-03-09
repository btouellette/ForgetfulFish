import { runPipelineWithResult } from "../actions/pipeline";
import type { ReplacementId } from "../actions/action";
import { applyActions } from "../actions/executor";
import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
import { captureSnapshot, lkiKey } from "../state/lki";
import { bumpZcc, zoneKey } from "../state/zones";
import { resolveOnResolveEffect } from "./effects/handlers";
import type { ResolveMutableState } from "./effects/types";
import { OnResolveRegistry } from "./onResolveRegistry";

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

function collectReplacementSelections(
  scratch: Readonly<Record<string, unknown>>
): Map<string, ReplacementId> {
  const selections = new Map<string, ReplacementId>();

  for (const [key, value] of Object.entries(scratch)) {
    if (!key.startsWith("choice:")) {
      continue;
    }

    const choiceId = key.slice("choice:".length);
    if (!choiceId.startsWith("choice:replacement:")) {
      continue;
    }

    if (typeof value !== "object" || value === null) {
      continue;
    }

    const payload = value as { type?: unknown; replacementId?: unknown };
    if (payload.type === "CHOOSE_REPLACEMENT" && typeof payload.replacementId === "string") {
      selections.set(choiceId, payload.replacementId);
    }
  }

  return selections;
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
  const onResolveRegistry = new OnResolveRegistry(cardDefinition.onResolve);
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

  const mutable: ResolveMutableState = {
    nextStack: state.stack.slice(0, -1),
    nextStackZone: currentStackZone.filter((id) => id !== stackItem.object.id),
    nextZones: new Map(state.zones),
    nextObjectPool: new Map(state.objectPool),
    nextLkiStore: new Map(state.lkiStore),
    nextPlayers: [
      {
        ...state.players[0],
        hand: [...state.players[0].hand]
      },
      {
        ...state.players[1],
        hand: [...state.players[1].hand]
      }
    ]
  };

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

  mutable.nextZones.set(stackKey, mutable.nextStackZone);

  const markAttemptedDrawFromEmptyLibrary = (playerId: string): void => {
    mutable.nextPlayers =
      mutable.nextPlayers[0].id === playerId
        ? [
            {
              ...mutable.nextPlayers[0],
              attemptedDrawFromEmptyLibrary: true
            },
            mutable.nextPlayers[1]
          ]
        : [
            mutable.nextPlayers[0],
            {
              ...mutable.nextPlayers[1],
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

    const currentLibrary = mutable.nextZones.get(libraryKey) ?? [];
    const drawnCardId = currentLibrary[0];
    if (drawnCardId === undefined) {
      markAttemptedDrawFromEmptyLibrary(playerId);
      return;
    }

    mutable.nextZones.set(libraryKey, currentLibrary.slice(1));
    mutable.nextZones.set(handKey, [...(mutable.nextZones.get(handKey) ?? []), drawnCardId]);

    const drawnObject = mutable.nextObjectPool.get(drawnCardId);
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
    mutable.nextObjectPool.set(movedDrawnObject.id, movedDrawnObject);
    mutable.nextLkiStore.set(
      lkiKey(drawnObject.id, drawnObject.zcc),
      captureSnapshot(drawnObject, drawnObject, libraryZone)
    );

    mutable.nextPlayers =
      mutable.nextPlayers[0].id === playerId
        ? [
            {
              ...mutable.nextPlayers[0],
              hand: [...mutable.nextPlayers[0].hand, drawnCardId]
            },
            mutable.nextPlayers[1]
          ]
        : [
            mutable.nextPlayers[0],
            {
              ...mutable.nextPlayers[1],
              hand: [...mutable.nextPlayers[1].hand, drawnCardId]
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
    mutable.nextZones.set(stackKey, [...currentStackZone]);
    nextVersion += 1;

    const nextState: GameState = {
      ...state,
      version: nextVersion,
      players: mutable.nextPlayers,
      stack: pausedStack,
      zones: mutable.nextZones,
      objectPool: mutable.nextObjectPool,
      lkiStore: mutable.nextLkiStore,
      pendingChoice: choice
    };

    return {
      state: nextState,
      events: resolutionEvents,
      pendingChoice: choice
    };
  };

  if (!allTargetsIllegal) {
    const isResumingPipelineChoice =
      stackItem.effectContext.cursor.kind === "step" &&
      stackItem.effectContext.whiteboard.scratch[`pipelineChoice:${stackItem.id}`] === true;

    if (!isResumingPipelineChoice) {
      for (const effectSpec of cardDefinition.onResolve) {
        const effectResult = resolveOnResolveEffect(effectSpec, {
          state,
          stackItem,
          cardDefinition,
          rng,
          mutable,
          effects: onResolveRegistry,
          drawOneCard,
          emit,
          pauseWithChoice
        });

        if (effectResult.kind === "pause") {
          return effectResult.result;
        }
      }
    }
  }

  const pipelineState: GameState = {
    ...state,
    version: nextVersion,
    players: mutable.nextPlayers,
    stack: mutable.nextStack,
    zones: mutable.nextZones,
    objectPool: mutable.nextObjectPool,
    lkiStore: mutable.nextLkiStore,
    pendingChoice: null
  };

  const pipelineResult = runPipelineWithResult(
    pipelineState,
    stackItem.effectContext.whiteboard.actions,
    {
      replacementSelections: collectReplacementSelections(
        stackItem.effectContext.whiteboard.scratch
      )
    }
  );
  if (pipelineResult.pendingChoice !== null) {
    const choice = pipelineResult.pendingChoice;
    const resumeStepIndex =
      stackItem.effectContext.cursor.kind === "step" ? stackItem.effectContext.cursor.index : 0;
    const pausedTopItem: GameState["stack"][number] = {
      ...stackItem,
      effectContext: {
        ...stackItem.effectContext,
        cursor: { kind: "waiting_choice", choiceId: choice.id },
        whiteboard: {
          ...stackItem.effectContext.whiteboard,
          actions: pipelineResult.actions,
          scratch: {
            ...stackItem.effectContext.whiteboard.scratch,
            [`pipelineChoice:${stackItem.id}`]: true,
            [`resumeStepIndex:${choice.id}`]: resumeStepIndex
          }
        }
      }
    };

    return pauseWithChoice(choice, pausedTopItem);
  }

  const postActionState = applyActions(pipelineState, pipelineResult.actions, rng);
  mutable.nextPlayers = postActionState.players;
  mutable.nextZones = postActionState.zones;
  mutable.nextObjectPool = postActionState.objectPool;
  mutable.nextLkiStore = postActionState.lkiStore;

  const movedObject = bumpZcc({
    ...object,
    zone: destinationZone
  });
  mutable.nextObjectPool.set(movedObject.id, movedObject);

  const destinationKey = zoneKey(destinationZone);
  const currentDestination = mutable.nextZones.get(destinationKey) ?? [];
  const nextDestination = [...currentDestination, stackItem.object.id];
  mutable.nextZones.set(destinationKey, nextDestination);

  emit(
    allTargetsIllegal
      ? { type: "SPELL_COUNTERED", object: { id: movedObject.id, zcc: movedObject.zcc } }
      : { type: "SPELL_RESOLVED", object: { id: movedObject.id, zcc: movedObject.zcc } }
  );

  const nextState: GameState = {
    ...state,
    version: nextVersion,
    players: mutable.nextPlayers,
    stack: mutable.nextStack,
    zones: mutable.nextZones,
    objectPool: mutable.nextObjectPool,
    lkiStore: mutable.nextLkiStore,
    pendingChoice: null
  };

  return {
    state: nextState,
    events: resolutionEvents,
    pendingChoice: null
  };
}
