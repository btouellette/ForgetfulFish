import { runPipelineWithResult } from "../actions/pipeline";
import type { ReplacementId } from "../actions/action";
import { applyActions } from "../actions/executor";
import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
import { bumpZcc, zoneKey } from "../state/zones";
import type { ResolveEffectNode } from "../cards/resolveEffect";
import { evaluateResolveCondition } from "./effects/conditions";
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
  const resumeCursor = stackItem.effectContext.cursor;
  const resumePhase = resumeCursor.kind === "node" ? resumeCursor.phase : "effects";
  const resumeOnResolvePath: readonly number[] =
    resumeCursor.kind === "node" ? resumeCursor.path : [];

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

  const walkNode = (
    node: ResolveEffectNode,
    path: number[],
    resumePath: readonly number[]
  ): ResolveStackResult | null => {
    switch (node.kind) {
      case "sequence": {
        const startIndex = resumePath[0] ?? 0;
        for (let index = startIndex; index < node.children.length; index += 1) {
          const child = node.children[index];
          if (child === undefined) {
            continue;
          }

          const paused = walkNode(
            child,
            [...path, index],
            index === startIndex ? resumePath.slice(1) : []
          );
          if (paused !== null) {
            return paused;
          }
        }

        return null;
      }
      case "conditional": {
        // Resuming re-enters the branch recorded in the path instead of re-evaluating the
        // condition, whose inputs may have been overwritten by the choice that paused it.
        const branchIndex =
          resumePath.length > 0
            ? (resumePath[0] ?? 0)
            : evaluateResolveCondition(node.if, {
                  scratch: activeStackItem.effectContext.whiteboard.scratch,
                  objectPool: mutable.nextObjectPool
                })
              ? 0
              : 1;
        const branch = branchIndex === 0 ? node.then : node.else;

        return branch === undefined
          ? null
          : walkNode(branch, [...path, branchIndex], resumePath.slice(1));
      }
      default: {
        const effectResult = resolveOnResolveEffect(node, {
          state,
          stackItem: activeStackItem,
          path,
          cardDefinition,
          rng,
          mutable,
          effects: onResolveRegistry,
          writeScratch,
          enqueueAction,
          emit,
          pauseWithChoice
        });

        return effectResult.kind === "pause" ? effectResult.result : null;
      }
    }
  };

  if (!allTargetsIllegal && resumePhase !== "pipeline") {
    const paused = walkNode(
      { kind: "sequence", children: cardDefinition.onResolve },
      [],
      resumeOnResolvePath
    );
    if (paused !== null) {
      return paused;
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
    const pausedTopItem: GameState["stack"][number] = {
      ...stackItem,
      effectContext: {
        ...stackItem.effectContext,
        cursor: {
          kind: "waiting_choice",
          choiceId: choice.id,
          resumePath: [],
          phase: "pipeline"
        },
        whiteboard: {
          ...stackItem.effectContext.whiteboard,
          actions: pipelineResult.actions
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
