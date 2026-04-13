import { createEvent, type EventEnvelope, type GameEvent } from "../../events/event";
import type { GameState } from "../../state/gameState";

type CleanupExpiredEffectsResult = {
  state: GameState;
  events: GameEvent[];
};

function buildEnvelope(state: Readonly<GameState>): EventEnvelope {
  return {
    engineVersion: state.engineVersion,
    schemaVersion: 1,
    gameId: state.id
  };
}

export function cleanupExpiredEffects(state: Readonly<GameState>): CleanupExpiredEffectsResult {
  const removedEffects = state.continuousEffects.filter(
    (effect) => effect.duration === "until_end_of_turn"
  );

  if (removedEffects.length === 0) {
    return {
      state: { ...state },
      events: []
    };
  }

  const events = removedEffects.map((effect, index) =>
    createEvent(buildEnvelope(state), state.version + index + 1, {
      type: "CONTINUOUS_EFFECT_REMOVED",
      effectId: effect.id
    })
  );

  return {
    state: {
      ...state,
      version: state.version + removedEffects.length,
      continuousEffects: state.continuousEffects.filter(
        (effect) => effect.duration !== "until_end_of_turn"
      )
    },
    events
  };
}
