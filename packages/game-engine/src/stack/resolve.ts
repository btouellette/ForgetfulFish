import { runPipelineWithResult } from "../actions/pipeline";
import type { ReplacementId } from "../actions/action";
import { applyActions } from "../actions/executor";
import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
import { bumpZcc, zoneKey } from "../state/zones";
import {
  readResumePoint,
  resumePointScratch,
  runResolveSteps,
  type ResolveResumePoint
} from "./effects/interpreter";
import { snapshotState } from "./effects/selectors";
import type { PauseResult, ResolveMutableState, ResolveStepPath } from "./effects/types";
import type { StackItem } from "./stackItem";

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
  const allTargetsIllegal =
    stackItem.targets.length > 0 &&
    validatedTargets.legalTargets.length === 0 &&
    validatedTargets.illegalTargets.length > 0;
  const resumePoint = readResumePoint(stackItem);
  const pipelineChoiceKey = `pipelineChoice:${stackItem.id}`;
  const isResumingPipelineChoice =
    stackItem.effectContext.cursor.kind === "step" &&
    stackItem.effectContext.whiteboard.scratch[pipelineChoiceKey] === true;

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
  let pendingWhiteboardActions = [...stackItem.effectContext.whiteboard.actions];

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
    updatedTopItem: StackItem
  ): PauseResult => {
    const pausedStack = [...mutable.nextStack, updatedTopItem];
    mutable.nextZones.set(stackKey, [
      ...(mutable.nextZones.get(stackKey) ?? []),
      stackItem.object.id
    ]);
    nextVersion += 1;

    const nextState: GameState = {
      ...snapshotState(state, mutable, nextVersion),
      stack: pausedStack,
      pendingChoice: choice
    };

    return {
      state: nextState,
      events: resolutionEvents,
      pendingChoice: choice
    };
  };

  /**
   * Runs every pending action through the replacement pipeline and applies it.
   * A replacement choice persists the rewritten actions and where to resume.
   */
  const flushActions = (resumeAfter: ResolveResumePoint | null): PauseResult | null => {
    const actions = [...pendingWhiteboardActions, ...mutable.nextActions];
    pendingWhiteboardActions = [];
    mutable.nextActions = [];
    if (actions.length === 0) {
      return null;
    }

    activeStackItem = {
      ...activeStackItem,
      effectContext: {
        ...activeStackItem.effectContext,
        whiteboard: { ...activeStackItem.effectContext.whiteboard, actions: [] }
      }
    };

    const pipelineState = snapshotState(state, mutable, nextVersion);
    const pipelineResult = runPipelineWithResult(pipelineState, actions, {
      replacementSelections: collectReplacementSelections(
        activeStackItem.effectContext.whiteboard.scratch
      )
    });
    if (pipelineResult.pendingChoice !== null) {
      const choice = pipelineResult.pendingChoice;
      const pausedTopItem: StackItem = {
        ...activeStackItem,
        effectContext: {
          ...activeStackItem.effectContext,
          cursor: { kind: "waiting_choice", choiceId: choice.id },
          whiteboard: {
            actions: pipelineResult.actions,
            scratch: {
              ...activeStackItem.effectContext.whiteboard.scratch,
              [pipelineChoiceKey]: true,
              ...(resumeAfter === null ? {} : resumePointScratch(resumeAfter))
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
    return null;
  };

  if (isResumingPipelineChoice) {
    writeScratch({ [pipelineChoiceKey]: false });
    const pipelinePause = flushActions(resumePoint);
    if (pipelinePause !== null) {
      return pipelinePause;
    }
  }

  if (!allTargetsIllegal) {
    const resumeFrom =
      isResumingPipelineChoice && resumePoint !== null
        ? { path: resumePoint.path, skipLeaf: true }
        : resumePoint;
    const stepsResult = runResolveSteps(
      cardDefinition.onResolve,
      {
        state,
        currentStackItem: () => activeStackItem,
        cardDefinition,
        rng,
        mutable,
        writeScratch,
        enqueueAction,
        emit,
        pauseWithChoice,
        flushActions: (path: ResolveStepPath) => flushActions({ path, skipLeaf: true })
      },
      resumeFrom
    );
    if (stepsResult.kind === "pause") {
      return stepsResult.result;
    }
  }

  const finalPause = flushActions({ path: [cardDefinition.onResolve.length], skipLeaf: true });
  if (finalPause !== null) {
    return finalPause;
  }

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

  return {
    state: snapshotState(state, mutable, nextVersion),
    events: resolutionEvents,
    pendingChoice: null
  };
}
