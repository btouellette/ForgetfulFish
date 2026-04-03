import { runPipelineWithResult } from "../actions/pipeline";
import type { ReplacementId } from "../actions/action";
import { applyActions } from "../actions/executor";
import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
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
  const resumeOnResolveIndexRaw = stackItem.effectContext.whiteboard.scratch.onResolveEffectIndex;
  const resumeOnResolveIndex =
    typeof resumeOnResolveIndexRaw === "number" && resumeOnResolveIndexRaw >= 0
      ? resumeOnResolveIndexRaw
      : 0;

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
    nextActions: [],
    nextZones: new Map(state.zones),
    nextObjectPool: new Map(state.objectPool),
    nextContinuousEffects: [...state.continuousEffects],
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

  const enqueueAction = (action: (typeof mutable.nextActions)[number]): void => {
    mutable.nextActions.push(action);
  };

  let activeStackItem = stackItem;

  const writeScratch = (entries: Record<string, unknown>): void => {
    activeStackItem = {
      ...activeStackItem,
      effectContext: {
        ...activeStackItem.effectContext,
        whiteboard: {
          ...activeStackItem.effectContext.whiteboard,
          scratch: {
            ...activeStackItem.effectContext.whiteboard.scratch,
            ...entries
          }
        }
      }
    };
  };

  const pauseWithChoice = (
    choice: NonNullable<GameState["pendingChoice"]>,
    updatedTopItem: GameState["stack"][number]
  ): ResolveStackResult => {
    if (choice.type !== "CHOOSE_REPLACEMENT" && mutable.nextActions.length > 0) {
      const prePauseState: GameState = {
        ...state,
        version: nextVersion,
        players: mutable.nextPlayers,
        stack: mutable.nextStack,
        zones: mutable.nextZones,
        objectPool: mutable.nextObjectPool,
        continuousEffects: mutable.nextContinuousEffects,
        lkiStore: mutable.nextLkiStore,
        pendingChoice: null
      };
      const postActionState = applyActions(prePauseState, mutable.nextActions, rng, emit);
      mutable.nextPlayers = postActionState.players;
      mutable.nextZones = postActionState.zones;
      mutable.nextObjectPool = postActionState.objectPool;
      mutable.nextContinuousEffects = postActionState.continuousEffects;
      mutable.nextLkiStore = postActionState.lkiStore;
      mutable.nextStack = postActionState.stack;
      mutable.nextActions = [];
    }

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
      continuousEffects: mutable.nextContinuousEffects,
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
      for (
        let effectIndex = resumeOnResolveIndex;
        effectIndex < cardDefinition.onResolve.length;
        effectIndex += 1
      ) {
        const effectSpec = cardDefinition.onResolve[effectIndex];
        if (effectSpec === undefined) {
          continue;
        }

        const effectResult = resolveOnResolveEffect(effectSpec, {
          state,
          stackItem: activeStackItem,
          cardDefinition,
          rng,
          mutable,
          effects: onResolveRegistry,
          writeScratch,
          enqueueAction,
          emit,
          pauseWithChoice
        });

        if (effectResult.kind === "pause") {
          const pausedTopIndex = effectResult.result.state.stack.length - 1;
          const pausedTopItem = effectResult.result.state.stack[pausedTopIndex];
          if (pausedTopItem === undefined) {
            return effectResult.result;
          }

          const nextStack = effectResult.result.state.stack.slice();
          nextStack[pausedTopIndex] = {
            ...pausedTopItem,
            effectContext: {
              ...pausedTopItem.effectContext,
              whiteboard: {
                ...pausedTopItem.effectContext.whiteboard,
                scratch: {
                  ...pausedTopItem.effectContext.whiteboard.scratch,
                  onResolveEffectIndex: effectIndex
                }
              }
            }
          };

          return {
            ...effectResult.result,
            state: {
              ...effectResult.result.state,
              stack: nextStack
            }
          };
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
    continuousEffects: mutable.nextContinuousEffects,
    lkiStore: mutable.nextLkiStore,
    pendingChoice: null
  };

  const pipelineResult = runPipelineWithResult(
    pipelineState,
    [...stackItem.effectContext.whiteboard.actions, ...mutable.nextActions],
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

  const postActionState = applyActions(pipelineState, pipelineResult.actions, rng, emit);
  mutable.nextPlayers = postActionState.players;
  mutable.nextZones = postActionState.zones;
  mutable.nextObjectPool = postActionState.objectPool;
  mutable.nextContinuousEffects = postActionState.continuousEffects;
  mutable.nextLkiStore = postActionState.lkiStore;
  mutable.nextStack = postActionState.stack;

  const movedObject = bumpZcc({
    ...object,
    zone: destinationZone,
    summoningSick:
      object.zone.kind !== "battlefield" &&
      destinationZone.kind === "battlefield" &&
      cardDefinition.typeLine.includes("Creature")
        ? true
        : object.summoningSick
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
    continuousEffects: mutable.nextContinuousEffects,
    lkiStore: mutable.nextLkiStore,
    pendingChoice: null
  };

  return {
    state: nextState,
    events: resolutionEvents,
    pendingChoice: null
  };
}
