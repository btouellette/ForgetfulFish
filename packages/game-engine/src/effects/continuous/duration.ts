import { createEvent, type EventEnvelope, type GameEvent } from "../../events/event";
import { computeGameObject, conditionAppliesToView, matchesEffectTarget } from "./layers";
import type { GameState } from "../../state/gameState";

type CleanupExpiredEffectsResult = {
  state: GameState;
  events: GameEvent[];
};

function createRemovalResult(
  state: Readonly<GameState>,
  removedEffectIds: string[]
): CleanupExpiredEffectsResult {
  if (removedEffectIds.length === 0) {
    return {
      state: { ...state },
      events: []
    };
  }

  const removedIdSet = new Set(removedEffectIds);
  const events = removedEffectIds.map((effectId, index) =>
    createEvent(buildEnvelope(state), state.version + index + 1, {
      type: "CONTINUOUS_EFFECT_REMOVED",
      effectId
    })
  );

  return {
    state: {
      ...state,
      version: state.version + removedEffectIds.length,
      continuousEffects: state.continuousEffects.filter((effect) => !removedIdSet.has(effect.id))
    },
    events
  };
}

function buildEnvelope(state: Readonly<GameState>): EventEnvelope {
  return {
    engineVersion: state.engineVersion,
    schemaVersion: 1,
    gameId: state.id
  };
}

export function cleanupExpiredEffects(state: Readonly<GameState>): CleanupExpiredEffectsResult {
  return createRemovalResult(
    state,
    state.continuousEffects
      .filter((effect) => effect.duration === "until_end_of_turn")
      .map((effect) => effect.id)
  );
}

export function cleanupUntilCleanupEffects(
  state: Readonly<GameState>
): CleanupExpiredEffectsResult {
  return createRemovalResult(
    state,
    state.continuousEffects
      .filter((effect) => effect.duration === "until_cleanup")
      .map((effect) => effect.id)
  );
}

export function removeAsLongAsEffects(state: Readonly<GameState>): CleanupExpiredEffectsResult {
  const removedEffectIds = state.continuousEffects
    .filter((effect) => {
      if (typeof effect.duration === "string" || effect.duration.kind !== "as_long_as") {
        return false;
      }

      const stateWithoutEffect: GameState = {
        ...state,
        continuousEffects: state.continuousEffects.filter(
          (candidateEffect) => candidateEffect.id !== effect.id
        )
      };

      for (const [objectId] of stateWithoutEffect.objectPool) {
        const view = computeGameObject(objectId, stateWithoutEffect);
        if (!matchesEffectTarget(effect.appliesTo, view, stateWithoutEffect)) {
          continue;
        }

        if (conditionAppliesToView(effect.duration.condition, view, stateWithoutEffect)) {
          return false;
        }
      }

      return true;
    })
    .map((effect) => effect.id);

  return createRemovalResult(state, removedEffectIds);
}

export function removeSourceGoneEffects(state: Readonly<GameState>): CleanupExpiredEffectsResult {
  const removedEffectIds = state.continuousEffects
    .filter((effect) => {
      if (effect.duration !== "while_source_on_battlefield") {
        return false;
      }

      const sourceObject = state.objectPool.get(effect.source.id);
      if (sourceObject === undefined) {
        return true;
      }

      if (sourceObject.zone.kind !== "battlefield") {
        return true;
      }

      return sourceObject.zcc !== effect.source.zcc;
    })
    .map((effect) => effect.id);

  return createRemovalResult(state, removedEffectIds);
}
